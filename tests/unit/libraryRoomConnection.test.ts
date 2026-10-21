// Women's Library, lot 5 — la connexion d'une joueuse aux canaux PRIVÉS d'une
// salle (features/player/library/realtime/connection.ts), éprouvée sur le
// Realtime EN MÉMOIRE de la page de développement (dev/fakeRealtime.ts), avec
// une horloge et des minuteries injectées.
//   * mode discret (salle de lecture) : on reçoit tout, on n'envoie RIEN ;
//     `setVisible(true)` se montre (`track`), `false` redevient discrète ;
//   * cadences : un move toutes les 150 ms (le dernier demandé part en fin de
//     fenêtre), une emote ou une phrase par seconde ; pas de phrase en salle
//     de lecture ;
//   * seuls les canaux SERVEUR décident : un `kicked` forgé sur le canal de la
//     salle est ignoré ; `kicked` (chat), `banned` (tenant), `hide` (ma
//     boîte, avec `leaveRoomId`) évincent ou masquent ; `unhide` révèle ;
//   * `close()` retire les quatre canaux ;
//   * (lot 14a) les autres n'apparaissent qu'une fois leur JETON DE PRÉSENCE
//     vérifié (signé ici par un signataire de test) : chaque test attend
//     `settle()` avant de les compter.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createLibraryRoomConnection,
  type LibraryConnectionOptions,
  type LibraryConnectionStatus,
  type LibraryEviction,
  type LibraryRoomConnection,
} from '../../features/player/library/realtime/connection';
import type { RoomSocialState } from '../../features/player/library/realtime/roomState';
import {
  createFakeRealtime,
  FAKE_ROOM_ID,
  FAKE_SELF_ID,
  fakeEnterResponse,
} from '../../features/player/library/dev/fakeRealtime';
import { createDevPresenceSigner } from '../../features/player/library/dev/presenceSigner';
import type { LibraryPresenceGrant } from '../../features/player/library/socialResponses';
import type { LibraryRoomKind } from '../../features/player/library/socialResponses';

const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';
const OTHER_ROOM = '00000000-0000-4000-8000-0000000000c2';
const UNTIL = '2026-10-20T15:30:00.000Z';

/** Lot 14a : MON jeton et ceux d'Iris et Nova, signés une fois pour toutes. */
let selfGrant: LibraryPresenceGrant;
const tickets: Record<string, string> = {};
beforeAll(async () => {
  const signer = await createDevPresenceSigner();
  selfGrant = await signer.grant({
    roomId: FAKE_ROOM_ID,
    userId: FAKE_SELF_ID,
    nickname: 'Lune',
    avatarId: 'a03',
  });
  for (const [userId, nickname] of [
    [IRIS, 'Iris'],
    [NOVA, 'Nova'],
  ]) {
    tickets[userId] = await signer.sign({
      roomId: FAKE_ROOM_ID,
      userId,
      nickname,
      avatarId: 'a05',
    });
  }
});

/** La présence d'une autre : sa case et son jeton (le pseudo est dans le jeton). */
const peer = (userId: string, _nickname: string, gx = 1, gy = 1) => ({
  userId,
  gx,
  gy,
  dir: 4,
  ticket: tickets[userId],
});

/** Laisse passer `setAuth`, l'abonnement et les `close()` asynchrones. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let open: LibraryRoomConnection[] = [];
afterEach(async () => {
  for (const c of open) await c.close();
  open = [];
});

function setup(
  kind: LibraryRoomKind = 'hall',
  extra: Partial<LibraryConnectionOptions> = {}
) {
  const bus = createFakeRealtime();
  const enter = fakeEnterResponse(kind, { presence: selfGrant });
  let clock = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const states: RoomSocialState[] = [];
  const evictions: LibraryEviction[] = [];
  const statuses: LibraryConnectionStatus[] = [];

  const conn = createLibraryRoomConnection({
    client: bus.client,
    enter,
    position: { gx: 2, gy: 2, dir: 4 },
    onState: (s) => states.push(s),
    onEvicted: (e) => evictions.push(e),
    onStatus: (s) => statuses.push(s),
    now: () => clock,
    setTimer: (fn, ms) => {
      seq += 1;
      timers.set(seq, { at: clock + ms, fn });
      return seq;
    },
    clearTimer: (h) => {
      timers.delete(h as number);
    },
    ...extra,
  });
  open.push(conn);

  /** Avance l'horloge et déclenche les minuteries échues, dans l'ordre. */
  const advance = (ms: number) => {
    const target = clock + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      clock = due[1].at;
      due[1].fn();
    }
    clock = target;
  };

  const sent = (event?: string) =>
    bus.sent
      .filter((m) => m.topic === enter.topics.room)
      .filter((m) => !event || m.event === event)
      .map((m) => m.payload);
  const myPresence = () =>
    bus.presenceState(enter.topics.room)[FAKE_SELF_ID]?.[0];
  const avatarIds = () => Object.keys(conn.getState().avatars).sort();
  /** Les jetons reçus sont jugés, la présence relue. */
  const settle = async () => {
    await conn.presenceSettled();
    await flush();
  };

  return {
    settle,
    bus,
    enter,
    conn,
    states,
    evictions,
    statuses,
    advance,
    sent,
    myPresence,
    avatarIds,
  };
}

describe('connexion — les quatre canaux privés', () => {
  it('rejoint room, chat, tenant et user, puis se dit connectée', async () => {
    const { bus, enter, statuses } = setup();
    expect(statuses).toEqual(['connecting']);
    await flush();
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(bus.topics()).toEqual(
      [
        enter.topics.chat,
        enter.topics.room,
        enter.topics.tenant,
        enter.topics.user,
      ].sort()
    );
  });

  it('voit les autres, jamais soi', async () => {
    const { bus, enter, avatarIds, myPresence, settle } = setup();
    await flush();
    expect(myPresence()).toBeDefined();
    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris'));
    await settle();
    expect(avatarIds()).toEqual([IRIS]);
  });

  it('close() retire les quatre canaux et sa présence ; plus rien ne part', async () => {
    const { bus, conn, statuses, sent, myPresence } = setup();
    await flush();
    await conn.close();
    expect(bus.topics()).toEqual([]);
    expect(myPresence()).toBeUndefined();
    expect(statuses.at(-1)).toBe('closed');
    expect(conn.sendMove(1, 1)).toBe('refused');
    expect(conn.sendEmote('wave')).toBe(false);
    expect(sent()).toEqual([]);
  });
});

describe('connexion — mode discret (Grande salle de lecture)', () => {
  it('n’annonce aucune présence et n’envoie rien, mais voit celles qui sont visibles', async () => {
    const { bus, enter, conn, sent, myPresence, avatarIds, settle } =
      setup('reading_room');
    await flush();
    expect(conn.isVisible()).toBe(false);
    expect(myPresence()).toBeUndefined();
    expect(conn.sendMove(1, 1)).toBe('refused');
    expect(conn.sendEmote('wave')).toBe(false);
    conn.updatePosition({ gx: 3, gy: 3, dir: 2 });
    expect(myPresence()).toBeUndefined();
    expect(sent()).toEqual([]);
    expect(bus.sent).toEqual([]);

    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris'));
    await settle();
    expect(avatarIds()).toEqual([IRIS]);
  });

  it('setVisible(true) se montre (`track`), setVisible(false) redevient discrète (`untrack`)', async () => {
    const { conn, myPresence, sent } = setup('reading_room');
    await flush();
    await conn.setVisible(true);
    expect(conn.isVisible()).toBe(true);
    expect(myPresence()).toMatchObject({
      userId: FAKE_SELF_ID,
      ticket: selfGrant.ticket,
      gx: 2,
      gy: 2,
    });
    expect(conn.sendEmote('wave')).toBe(true);
    await conn.setVisible(false);
    expect(conn.isVisible()).toBe(false);
    expect(myPresence()).toBeUndefined();
    expect(conn.sendMove(1, 1)).toBe('refused');
    expect(sent('emote')).toHaveLength(1);
  });

  it('`canBeVisible: false` (réservé) : rester discrète, même sur demande', async () => {
    const bus = createFakeRealtime();
    const conn = createLibraryRoomConnection({
      client: bus.client,
      enter: { ...fakeEnterResponse('hall'), canBeVisible: false },
      position: { gx: 0, gy: 0, dir: 0 },
      onState: () => {},
      onEvicted: () => {},
    });
    open.push(conn);
    await flush();
    expect(conn.isVisible()).toBe(false);
    await conn.setVisible(true);
    expect(conn.isVisible()).toBe(false);
    expect(bus.sent).toEqual([]);
  });
});

describe('connexion — cadences d’envoi', () => {
  it('un move toutes les 150 ms au plus ; le DERNIER demandé part en fin de fenêtre', async () => {
    const { conn, advance, sent } = setup();
    await flush();
    expect(conn.sendMove(1, 1)).toBe('sent');
    advance(50);
    expect(conn.sendMove(2, 2)).toBe('queued');
    advance(10);
    expect(conn.sendMove(3, 3)).toBe('queued');
    expect(sent('move')).toHaveLength(1);
    advance(90);
    expect(sent('move')).toEqual([
      { userId: FAKE_SELF_ID, gx: 1, gy: 1, at: 0 },
      { userId: FAKE_SELF_ID, gx: 3, gy: 3, at: 150 },
    ]);
    advance(500);
    expect(conn.sendMove(4, 4)).toBe('sent');
    expect(sent('move')).toHaveLength(3);
  });

  it('une case hors de la salle ou non entière est refusée', async () => {
    const { conn, enter, sent } = setup();
    await flush();
    expect(conn.sendMove(enter.room.width, 0)).toBe('refused');
    expect(conn.sendMove(0, enter.room.depth)).toBe('refused');
    expect(conn.sendMove(-1, 0)).toBe('refused');
    expect(conn.sendMove(1.5, 0)).toBe('refused');
    expect(sent()).toEqual([]);
  });

  it('une emote ou une phrase par seconde au plus (au-delà : refusée)', async () => {
    const { conn, advance, sent } = setup();
    await flush();
    expect(conn.sendEmote('wave')).toBe(true);
    advance(500);
    expect(conn.sendPhrase('gg')).toBe(false);
    expect(conn.sendEmote('clap')).toBe(false);
    advance(500);
    expect(conn.sendPhrase('gg')).toBe(true);
    expect(sent()).toEqual([
      { userId: FAKE_SELF_ID, emote: 'wave' },
      { userId: FAKE_SELF_ID, phraseId: 'gg' },
    ]);
  });

  it('salle de lecture : pas de phrase, seulement les emotes douces (envoi ET réception)', async () => {
    const { bus, enter, conn, advance, sent, settle } = setup('reading_room', {
      visible: true,
    });
    await flush();
    expect(conn.sendPhrase('hello')).toBe(false);
    expect(conn.sendEmote('clap')).toBe(false);
    expect(conn.sendEmote('heart')).toBe(true);
    advance(1_000);
    expect(sent()).toEqual([{ userId: FAKE_SELF_ID, emote: 'heart' }]);

    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris'));
    await settle();
    expect(conn.getState().avatars[IRIS]).toBeDefined();
    bus.peerSend(enter.topics.room, 'phrase', { userId: IRIS, phraseId: 'gg' });
    bus.peerSend(enter.topics.room, 'emote', { userId: IRIS, emote: 'dance' });
    expect(conn.getState().avatars[IRIS]).toMatchObject({
      phrase: null,
      emote: null,
    });
  });

  it('la présence suit la case d’arrivée, au plus chaque seconde', async () => {
    const { conn, advance, myPresence } = setup();
    await flush();
    advance(100);
    conn.updatePosition({ gx: 5, gy: 6, dir: 3 });
    expect(myPresence()).toMatchObject({ gx: 2, gy: 2 });
    advance(900);
    expect(myPresence()).toMatchObject({ gx: 5, gy: 6, dir: 3 });
  });
});

describe('connexion — seuls les canaux SERVEUR décident', () => {
  it('un `kicked` FORGÉ sur le canal de la salle est ignoré', async () => {
    const { bus, enter, conn, evictions, statuses } = setup();
    await flush();
    bus.peerSend(enter.topics.room, 'kicked', {
      userId: FAKE_SELF_ID,
      until: UNTIL,
    });
    await flush();
    expect(evictions).toEqual([]);
    expect(statuses).not.toContain('closed');
    expect(conn.sendEmote('wave')).toBe(true);
  });

  it('un payload malformé sur le canal de la salle est jeté sans lever', async () => {
    const { bus, enter, avatarIds, settle } = setup();
    await flush();
    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris'));
    await settle();
    expect(() =>
      bus.peerSend(enter.topics.room, 'move', { userId: IRIS, gx: 'x' })
    ).not.toThrow();
    expect(avatarIds()).toEqual([IRIS]);
  });

  it('`kicked` du serveur (chat) pour moi : évincée, canaux fermés', async () => {
    const { bus, enter, evictions, myPresence } = setup('apartment');
    await flush();
    bus.server(enter.topics.chat, 'kicked', {
      userId: FAKE_SELF_ID,
      until: UNTIL,
    });
    await flush();
    expect(evictions).toEqual([{ kind: 'kicked', until: UNTIL }]);
    expect(bus.topics()).toEqual([]);
    expect(myPresence()).toBeUndefined();
  });

  it('`kicked` du serveur pour une autre : elle disparaît, et le reste', async () => {
    const { bus, enter, evictions, avatarIds, settle } = setup('apartment');
    await flush();
    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris'));
    await settle();
    expect(avatarIds()).toEqual([IRIS]);
    bus.server(enter.topics.chat, 'kicked', { userId: IRIS, until: UNTIL });
    expect(avatarIds()).toEqual([]);
    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris', 3, 3));
    await settle();
    expect(avatarIds()).toEqual([]);
    expect(evictions).toEqual([]);
  });

  it('`banned` (tenant) pour une autre : son avatar disparaît, même si elle émet encore', async () => {
    const { bus, enter, avatarIds, evictions, settle } = setup();
    await flush();
    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris'));
    bus.peerJoin(enter.topics.room, peer(NOVA, 'Nova'));
    await settle();
    expect(avatarIds()).toEqual([IRIS, NOVA]);
    bus.server(enter.topics.tenant, 'banned', { userId: IRIS, until: null });
    expect(avatarIds()).toEqual([NOVA]);
    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris', 4, 4));
    bus.peerSend(enter.topics.room, 'emote', { userId: IRIS, emote: 'wave' });
    expect(avatarIds()).toEqual([NOVA]);
    expect(evictions).toEqual([]);
  });

  it('`banned` pour moi : évincée (`until` transmis, `null` = sans date)', async () => {
    const { bus, enter, evictions } = setup();
    await flush();
    bus.server(enter.topics.tenant, 'banned', {
      userId: FAKE_SELF_ID,
      until: null,
    });
    await flush();
    expect(evictions).toEqual([{ kind: 'banned', until: null }]);
  });

  it('`hide` avec `leaveRoomId` = cette salle : évincée « fermée », SANS motif', async () => {
    const { bus, enter, evictions, avatarIds, settle } = setup('apartment');
    await flush();
    bus.peerJoin(enter.topics.room, peer(NOVA, 'Nova'));
    await settle();
    bus.server(enter.topics.user, 'hide', {
      userId: NOVA,
      leaveRoomId: FAKE_ROOM_ID,
    });
    await flush();
    expect(evictions).toEqual([{ kind: 'closed' }]);
    expect(avatarIds()).toEqual([]);
  });

  it('`hide` sans salle à quitter (ou une autre salle) : elle disparaît, on reste', async () => {
    const { bus, enter, evictions, avatarIds, settle } = setup();
    await flush();
    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris'));
    bus.peerJoin(enter.topics.room, peer(NOVA, 'Nova'));
    await settle();
    expect(avatarIds()).toEqual([IRIS, NOVA]);
    bus.server(enter.topics.user, 'hide', { userId: NOVA, leaveRoomId: null });
    bus.server(enter.topics.user, 'hide', {
      userId: IRIS,
      leaveRoomId: OTHER_ROOM,
    });
    await flush();
    expect(avatarIds()).toEqual([]);
    expect(evictions).toEqual([]);
  });

  it('`unhide` la révèle tout de suite si elle est là (présence relue)', async () => {
    const { bus, enter, avatarIds, settle } = setup();
    await flush();
    bus.peerJoin(enter.topics.room, peer(NOVA, 'Nova'));
    await settle();
    bus.server(enter.topics.user, 'hide', { userId: NOVA, leaveRoomId: null });
    expect(avatarIds()).toEqual([]);
    bus.server(enter.topics.user, 'unhide', { userId: NOVA });
    expect(avatarIds()).toEqual([NOVA]);
  });

  it('`hideLocally` (après MON blocage confirmé) la retire sans attendre le serveur', async () => {
    const { bus, enter, conn, avatarIds, settle } = setup();
    await flush();
    bus.peerJoin(enter.topics.room, peer(IRIS, 'Iris'));
    await settle();
    expect(avatarIds()).toEqual([IRIS]);
    conn.hideLocally(IRIS);
    expect(avatarIds()).toEqual([]);
    expect(conn.getState().hidden).toEqual([IRIS]);
  });

  it('un événement serveur mal formé est jeté', async () => {
    const { bus, enter, evictions } = setup();
    await flush();
    bus.server(enter.topics.chat, 'kicked', { userId: FAKE_SELF_ID });
    bus.server(enter.topics.tenant, 'banned', { userId: 'moi', until: null });
    await flush();
    expect(evictions).toEqual([]);
  });
});

describe('connexion — la posture (lot 15)', () => {
  it('la case visée part avec ce que j’y ferai ; ma présence avec ma posture', async () => {
    const { conn, sent, myPresence, advance } = setup();
    await flush();
    expect(conn.sendMove(3, 4, { seat: { item: 'inv-02', spot: 1 } })).toBe(
      'sent'
    );
    expect(sent('move').at(-1)).toMatchObject({
      gx: 3,
      gy: 4,
      seat: { item: 'inv-02', spot: 1 },
    });
    advance(2_000);
    conn.updatePosition({ gx: 3, gy: 4, dir: 5, use: { item: 'shelf' } });
    advance(2_000);
    expect(myPresence()).toMatchObject({
      gx: 3,
      gy: 4,
      use: { item: 'shelf' },
    });
    expect(myPresence()).not.toHaveProperty('seat');
    // Debout à nouveau : plus de posture dans la présence.
    advance(2_000);
    conn.updatePosition({ gx: 3, gy: 4, dir: 5 });
    advance(2_000);
    expect(myPresence()).not.toHaveProperty('use');
  });

  it('une posture hors gabarit ne part pas (debout) ; jamais `seat` et `use` ensemble', async () => {
    const { conn, sent, advance } = setup();
    await flush();
    conn.sendMove(1, 1, { seat: { item: 'pas un id', spot: 0 } });
    expect(sent('move').at(-1)).not.toHaveProperty('seat');
    expect(sent('move').at(-1)).toMatchObject({ gx: 1, gy: 1 });
    advance(1_000);
    conn.sendMove(2, 2, {
      seat: { item: 'sofa', spot: 0 },
      use: { item: 'shelf' },
    });
    expect(sent('move').at(-1)).toMatchObject({ seat: { item: 'sofa' } });
    expect(sent('move').at(-1)).not.toHaveProperty('use');
  });

  it('mode discret : la posture ne part pas plus que la case', async () => {
    const { conn, sent, myPresence } = setup('reading_room');
    await flush();
    expect(conn.sendMove(1, 1, { seat: { item: 'sofa', spot: 0 } })).toBe(
      'refused'
    );
    conn.updatePosition({
      gx: 1,
      gy: 1,
      dir: 4,
      seat: { item: 'sofa', spot: 0 },
    });
    expect(sent()).toEqual([]);
    expect(myPresence()).toBeUndefined();
  });

  it('la posture d’une autre arrive avec sa présence vérifiée', async () => {
    const { bus, enter, conn, settle } = setup();
    await flush();
    bus.peerJoin(enter.topics.room, {
      ...peer(IRIS, 'Iris'),
      seat: { item: 'sofa', spot: 0 },
    });
    await settle();
    expect(conn.getState().avatars[IRIS]?.seat).toEqual({
      item: 'sofa',
      spot: 0,
    });
  });
});
