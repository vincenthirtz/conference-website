// tests/unit/libraryCloudflareClient.test.ts
//
// Le client des salons du Worker temps réel pour la Women's Library
// (features/player/library/realtime/cloudflareClient.ts, docs/AUTH-BETTER-AUTH.md,
// lot 3), sur une fausse WebSocket. Ce qui est protégé ici :
//   1. l'adresse de connexion ne nomme ni la salle ni la personne ;
//   2. une seule demande de tickets pour les quatre canaux ;
//   3. un refus de l'API (4xx) ne boucle pas, une panne réessaie ;
//   4. la présence se relit comme sur Supabase, et repart après une reconnexion ;
//   5. avec la vraie connexion : deux joueuses se voient et se déplacent, et
//      seul un événement du serveur évince.

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import {
  createCloudflareLibraryRealtime,
  LIBRARY_REALTIME_BACKEND,
} from '../../features/player/library/realtime/cloudflareClient';
import {
  createLibraryRoomConnection,
  type LibraryChannelOptions,
  type LibraryEviction,
} from '../../features/player/library/realtime/connection';
import { visibleAvatars } from '../../features/player/library/realtime/roomState';
import {
  FAKE_ROOM_ID,
  fakeEnterResponse,
} from '../../features/player/library/dev/fakeRealtime';
import { createDevPresenceSigner } from '../../features/player/library/dev/presenceSigner';
import type {
  LibraryEnterResponse,
  LibraryRealtimeTicketsResponse,
} from '../../features/player/library/socialResponses';

const LUNE = '00000000-0000-4000-8000-000000000001';
const IRIS = '00000000-0000-4000-8000-000000000011';
const URL_BASE = 'https://realtime.example';

/* --------------------------------------------------------- fausse WebSocket --- */

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  closedWith: number | null = null;
  private listeners = new Map<string, Array<(e: { data?: unknown }) => void>>();

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }

  addEventListener(type: string, fn: (e: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  emit(type: string, data?: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data });
  }

  send(message: string) {
    this.sent.push(message);
    relay?.(this, message);
  }

  close(code?: number) {
    this.closedWith = code ?? 1000;
    this.readyState = FakeSocket.CLOSED;
    this.emit('close');
  }

  /** Le serveur accepte la connexion. */
  accept() {
    this.readyState = FakeSocket.OPEN;
    this.emit('open');
  }

  /** Le serveur envoie un message. */
  push(message: unknown) {
    this.emit('message', JSON.stringify(message));
  }

  /** Le réseau coupe. */
  drop() {
    this.readyState = FakeSocket.CLOSED;
    this.emit('close');
  }

  parsedSent() {
    return this.sent.filter((m) => m !== 'ping').map((m) => JSON.parse(m));
  }
}

/** Le relais du Worker, pour le scénario à deux joueuses. */
let relay: ((from: FakeSocket, message: string) => void) | null = null;

const OPTIONS: LibraryChannelOptions = { config: { private: true } };
const TOPICS = {
  room: `library:room:${FAKE_ROOM_ID}`,
  chat: `library:chat:${FAKE_ROOM_ID}`,
  tenant: 'library:tenant:t1',
  user: `library:user:${LUNE}`,
};
const bundle = (suffix = ''): LibraryRealtimeTicketsResponse => ({
  tickets: {
    room: `ticket-room${suffix}`,
    chat: `ticket-chat${suffix}`,
    tenant: `ticket-tenant${suffix}`,
    user: `ticket-user${suffix}`,
  },
  expiresAt: Math.floor(Date.now() / 1000) + 300,
});

/** Laisse passer les promesses sans avancer les minuteries. */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  FakeSocket.all = [];
  relay = null;
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('le transport', () => {
  it('passe par le Worker par défaut', () => {
    expect(LIBRARY_REALTIME_BACKEND).toBe('cloudflare');
  });
});

describe('la connexion', () => {
  it('une seule demande de tickets pour les quatre canaux, et aucun nom dans l’adresse', async () => {
    const fetchTickets = vi.fn(async () => bundle());
    const client = createCloudflareLibraryRealtime({
      fetchTickets,
      url: URL_BASE,
    });
    for (const topic of Object.values(TOPICS)) {
      client.channel(topic, OPTIONS).subscribe();
    }
    await flush();
    expect(fetchTickets).toHaveBeenCalledTimes(1);
    expect(FakeSocket.all.map((s) => s.url).sort()).toEqual(
      ['chat', 'room', 'tenant', 'user'].map(
        (f) => `wss://realtime.example/library?ticket=ticket-${f}`
      )
    );
    for (const s of FakeSocket.all) {
      expect(s.url).not.toContain(FAKE_ROOM_ID);
      expect(s.url).not.toContain(LUNE);
    }
  });

  it('un refus de l’API : CHANNEL_ERROR, sans nouvel essai', async () => {
    const fetchTickets = vi.fn(async () => {
      throw new PlayerHttpError('non', 403, { code: 'room_forbidden' });
    });
    const client = createCloudflareLibraryRealtime({
      fetchTickets,
      url: URL_BASE,
    });
    const statuses: string[] = [];
    client.channel(TOPICS.room, OPTIONS).subscribe((s) => statuses.push(s));
    await flush();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(statuses).toEqual(['CHANNEL_ERROR']);
    expect(fetchTickets).toHaveBeenCalledTimes(1);
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('une panne de l’API : nouvel essai', async () => {
    const fetchTickets = vi
      .fn<() => Promise<LibraryRealtimeTicketsResponse>>()
      .mockRejectedValueOnce(new PlayerHttpError('panne', 503, {}))
      .mockResolvedValue(bundle());
    const client = createCloudflareLibraryRealtime({
      fetchTickets,
      url: URL_BASE,
    });
    const statuses: string[] = [];
    client.channel(TOPICS.room, OPTIONS).subscribe((s) => statuses.push(s));
    await flush();
    expect(statuses).toEqual(['CHANNEL_ERROR']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.all).toHaveLength(1);
    FakeSocket.all[0].accept();
    expect(statuses).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED']);
  });

  it('une coupure : la présence s’efface, puis reconnexion et SUBSCRIBED', async () => {
    const fetchTickets = vi.fn(async () => bundle());
    const client = createCloudflareLibraryRealtime({
      fetchTickets,
      url: URL_BASE,
    });
    const statuses: string[] = [];
    const sync = vi.fn();
    const channel = client.channel(TOPICS.room, OPTIONS);
    channel.on('presence', { event: 'sync' }, sync);
    channel.subscribe((s) => statuses.push(s));
    await flush();
    const first = FakeSocket.all[0];
    first.accept();
    first.push({
      type: 'presence_state',
      entries: [{ conn: 'c1', key: IRIS, state: { gx: 1 } }],
    });
    expect(Object.keys(channel.presenceState())).toEqual([IRIS]);

    sync.mockClear();
    first.drop();
    expect(statuses).toEqual(['SUBSCRIBED', 'CLOSED']);
    expect(channel.presenceState()).toEqual({});
    expect(sync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.all).toHaveLength(2);
    // Le ticket encore valide resservait : pas de seconde demande.
    expect(fetchTickets).toHaveBeenCalledTimes(1);
    FakeSocket.all[1].accept();
    expect(statuses).toEqual(['SUBSCRIBED', 'CLOSED', 'SUBSCRIBED']);
  });

  it('un ticket presque échu ne rouvre pas : nouvelle demande', async () => {
    let clock = 1_000_000;
    const fetchTickets = vi.fn(async () => ({
      ...bundle(),
      expiresAt: Math.floor(clock / 1000) + 300,
    }));
    const client = createCloudflareLibraryRealtime({
      fetchTickets,
      url: URL_BASE,
      now: () => clock,
    });
    client.channel(TOPICS.room, OPTIONS).subscribe();
    await flush();
    FakeSocket.all[0].accept();
    clock += 290_000;
    FakeSocket.all[0].drop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchTickets).toHaveBeenCalledTimes(2);
  });

  it('removeChannel ferme, sans reconnexion ni renouvellement', async () => {
    const fetchTickets = vi.fn(async () => bundle());
    const client = createCloudflareLibraryRealtime({
      fetchTickets,
      url: URL_BASE,
    });
    const statuses: string[] = [];
    const channel = client.channel(TOPICS.room, OPTIONS);
    channel.subscribe((s) => statuses.push(s));
    await flush();
    FakeSocket.all[0].accept();
    client.removeChannel(channel);
    expect(FakeSocket.all[0].closedWith).toBe(1000);
    await vi.advanceTimersByTimeAsync(3 * 60 * 60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(fetchTickets).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['SUBSCRIBED']);
  });

  it('`ping` toutes les 30 s, et ticket renouvelé avant l’heure', async () => {
    const fetchTickets = vi
      .fn<() => Promise<LibraryRealtimeTicketsResponse>>()
      .mockImplementationOnce(async () => bundle())
      .mockImplementation(async () => bundle('-2'));
    const client = createCloudflareLibraryRealtime({
      fetchTickets,
      url: URL_BASE,
    });
    client.channel(TOPICS.chat, OPTIONS).subscribe();
    await flush();
    const socket = FakeSocket.all[0];
    socket.accept();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(socket.sent).toEqual(['ping']);
    await vi.advanceTimersByTimeAsync(45 * 60_000 - 30_000);
    expect(socket.parsedSent()).toEqual([
      { type: 'renew', ticket: 'ticket-chat-2' },
    ]);
    expect(fetchTickets).toHaveBeenCalledTimes(2);
    // Connexion gardée : pas une reconnexion.
    expect(FakeSocket.all).toHaveLength(1);
  });
});

describe('le canal', () => {
  async function opened(
    options: LibraryChannelOptions = OPTIONS,
    topic = TOPICS.room
  ) {
    const client = createCloudflareLibraryRealtime({
      fetchTickets: async () => bundle(),
      url: URL_BASE,
    });
    const channel = client.channel(topic, options);
    return { channel, client };
  }

  it('la présence se relit par clé, plusieurs connexions sous une même clé comprises', async () => {
    const { channel } = await opened();
    const sync = vi.fn();
    channel.on('presence', { event: 'sync' }, sync);
    channel.subscribe();
    await flush();
    const socket = FakeSocket.all[0];
    socket.accept();
    socket.push({ type: 'presence_state', entries: [] });
    expect(sync).toHaveBeenCalledTimes(1);
    socket.push({
      type: 'presence_join',
      conn: 'c1',
      key: IRIS,
      state: { gx: 1 },
    });
    socket.push({
      type: 'presence_join',
      conn: 'c2',
      key: IRIS,
      state: { gx: 2 },
    });
    expect(channel.presenceState()).toEqual({
      [IRIS]: [{ gx: 1 }, { gx: 2 }],
    });
    // La même connexion change de case : remplacée, pas ajoutée.
    socket.push({
      type: 'presence_join',
      conn: 'c1',
      key: IRIS,
      state: { gx: 5 },
    });
    expect(channel.presenceState()[IRIS]).toEqual([{ gx: 5 }, { gx: 2 }]);
    // Un départ arrive en état complet.
    socket.push({
      type: 'presence_state',
      entries: [{ conn: 'c2', key: IRIS, state: { gx: 2 } }],
    });
    expect(channel.presenceState()).toEqual({ [IRIS]: [{ gx: 2 }] });
  });

  it('un message reçu ne va qu’aux écoutes de son événement', async () => {
    const { channel } = await opened();
    const move = vi.fn();
    const emote = vi.fn();
    channel
      .on('broadcast', { event: 'move' }, move)
      .on('broadcast', { event: 'emote' }, emote);
    channel.subscribe();
    await flush();
    const socket = FakeSocket.all[0];
    socket.accept();
    socket.push({ type: 'broadcast', event: 'move', payload: { gx: 3 } });
    expect(move).toHaveBeenCalledWith({ payload: { gx: 3 } });
    expect(emote).not.toHaveBeenCalled();
  });

  it('ignore `pong` et ce qui n’est pas du JSON', async () => {
    const { channel } = await opened();
    const sync = vi.fn();
    channel.on('presence', { event: 'sync' }, sync);
    channel.subscribe();
    await flush();
    const socket = FakeSocket.all[0];
    socket.accept();
    socket.emit('message', 'pong');
    socket.emit('message', '{pas du json');
    socket.push({ type: 'inconnu' });
    socket.push({
      type: 'presence_join',
      conn: 1,
      key: IRIS,
      state: { gx: 1 },
    });
    expect(channel.presenceState()).toEqual({});
  });

  it('track, untrack et send partent sous la forme attendue, et jamais sur une connexion fermée', async () => {
    const { channel } = await opened({
      config: { private: true, presence: { key: LUNE, enabled: true } },
    });
    expect(await channel.track({ gx: 1 })).toBe('error');
    channel.subscribe();
    await flush();
    const socket = FakeSocket.all[0];
    socket.accept();
    await channel.track({ gx: 1 });
    await channel.send({
      type: 'broadcast',
      event: 'move',
      payload: { gx: 2 },
    });
    await channel.untrack();
    expect(socket.parsedSent()).toEqual([
      { type: 'track', key: LUNE, state: { gx: 1 } },
      { type: 'broadcast', event: 'move', payload: { gx: 2 } },
      { type: 'untrack' },
    ]);
  });
});

describe('avec la vraie connexion', () => {
  let luneEnter: LibraryEnterResponse;
  let irisEnter: LibraryEnterResponse;

  beforeAll(async () => {
    const signer = await createDevPresenceSigner();
    const enterFor = async (userId: string, nickname: string) =>
      fakeEnterResponse('hall', {
        me: { userId, nickname, avatarId: 'a03' },
        topics: { ...TOPICS, user: `library:user:${userId}` },
        presence: await signer.grant({
          roomId: FAKE_ROOM_ID,
          userId,
          nickname,
          avatarId: 'a03',
        }),
      });
    luneEnter = await enterFor(LUNE, 'Lune');
    irisEnter = await enterFor(IRIS, 'Iris');
  });

  /** Ce que fait le Worker dans un salon de joueuses, en bref. */
  function relayBetween(sockets: () => FakeSocket[]) {
    let conn = 0;
    const connOf = new Map<FakeSocket, string>();
    relay = (from, raw) => {
      if (raw === 'ping') return;
      const m = JSON.parse(raw);
      if (!connOf.has(from)) connOf.set(from, `c${++conn}`);
      for (const s of sockets()) {
        if (s === from) continue;
        if (m.type === 'broadcast') s.push(m);
        if (m.type === 'track') {
          s.push({
            type: 'presence_join',
            conn: connOf.get(from),
            key: m.key,
            state: m.state,
          });
        }
      }
    };
  }

  /** Le temps réel, le temps que WebCrypto juge les jetons. */
  async function settle() {
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  function connect(enter: LibraryEnterResponse) {
    const avatars: Array<ReturnType<typeof visibleAvatars>> = [];
    const evictions: LibraryEviction[] = [];
    const connection = createLibraryRoomConnection({
      client: createCloudflareLibraryRealtime({
        fetchTickets: async () => bundle(`-${enter.me.nickname}`),
        url: URL_BASE,
      }),
      enter,
      position: { gx: 2, gy: 2, dir: 4 },
      onState: (state) => avatars.push(visibleAvatars(state)),
      onEvicted: (e) => evictions.push(e),
    });
    return { connection, avatars, evictions };
  }

  const roomSocketOf = (nickname: string) =>
    FakeSocket.all.filter((s) => s.url.endsWith(`ticket-room-${nickname}`));

  it('deux joueuses se voient et se déplacent ; seul le serveur évince', async () => {
    const lune = connect(luneEnter);
    const iris = connect(irisEnter);
    await flush();
    await flush();
    expect(FakeSocket.all).toHaveLength(8);
    relayBetween(() => [...roomSocketOf('Lune'), ...roomSocketOf('Iris')]);
    for (const s of FakeSocket.all) s.accept();

    await settle();
    const seenByLune = lune.connection.getState();
    expect(visibleAvatars(seenByLune).map((a) => a.userId)).toEqual([IRIS]);
    expect(
      visibleAvatars(iris.connection.getState()).map((a) => a.userId)
    ).toEqual([LUNE]);
    // Le pseudo vient du jeton signé.
    expect(visibleAvatars(seenByLune)[0].nickname).toBe('Iris');

    expect(lune.connection.sendMove(5, 6)).toBe('sent');
    const moved = visibleAvatars(iris.connection.getState())[0];
    expect(moved.target).toMatchObject({ gx: 5, gy: 6 });

    // Un faux `kicked` passé dans le salon des joueuses ne fait rien.
    roomSocketOf('Iris')[0].push({
      type: 'broadcast',
      event: 'kicked',
      payload: { userId: IRIS, until: '2999-01-01T00:00:00.000Z' },
    });
    expect(iris.evictions).toEqual([]);

    // Le vrai arrive par le salon du serveur.
    const chat = FakeSocket.all.find((s) => s.url.endsWith('ticket-chat-Iris'));
    chat?.push({
      type: 'broadcast',
      event: 'kicked',
      payload: { userId: IRIS, until: '2999-01-01T00:00:00.000Z' },
    });
    await settle();
    expect(iris.evictions).toEqual([
      { kind: 'kicked', until: '2999-01-01T00:00:00.000Z' },
    ]);
    // Ses quatre connexions sont fermées.
    expect(
      FakeSocket.all
        .filter((s) => s.url.endsWith('-Iris'))
        .every((s) => s.closedWith === 1000)
    ).toBe(true);

    await lune.connection.close();
  });
});
