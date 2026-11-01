// tests/unit/realtimeLibraryRoom.test.ts
//
// Le salon (`Room`, realtime/worker.mjs) pour la Women's Library, avec de fausses
// connexions (docs/AUTH-BETTER-AUTH.md, lot 3). Ce qui est protégé ici :
//   1. une connexion sans ticket renouvelé est coupée : le refus d'une joueuse
//      bannie ou expulsée vaut au plus tard à l'heure, même si son client ignore
//      l'événement du serveur ;
//   2. un ticket forgé, ou celui d'un autre salon, ne renouvelle rien ;
//   3. seul `library:room:` s'écrit depuis un écran, sans écho, avec une limite ;
//   4. la présence : arrivée, mise à jour, retrait, départ ;
//   5. les autres salons ne changent pas.
// La connexion réelle est contrôlée par scripts/realtime-check.mjs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const SECRET = 'y'.repeat(40);
const ROOM = 'library:room:r1';
const CHAT = 'library:chat:r1';
const HOUR = 60 * 60_000;
const OPEN = 1;

class FakeSocket {
  readyState = OPEN;
  sent: string[] = [];
  closedWith: number | null = null;
  private attachment: unknown;

  constructor(attachment: unknown) {
    this.attachment = attachment;
  }

  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment() {
    return this.attachment ?? null;
  }

  send(message: string) {
    this.sent.push(message);
  }

  close(code: number) {
    this.closedWith = code;
    this.readyState = 3;
  }

  parsed() {
    return this.sent.map((m) => JSON.parse(m));
  }
}

// Adresse dans une variable : le Worker, en JavaScript sans types, reste hors
// du contrôle de types du site.
const WORKER_MODULE = '../../realtime/worker.mjs';

async function setup() {
  const { Room } = await import(/* @vite-ignore */ WORKER_MODULE);
  const sockets: FakeSocket[] = [];
  const room = new Room(
    {
      setWebSocketAutoResponse: () => {},
      getWebSockets: () => sockets,
    },
    { REALTIME_TICKET_SECRET: SECRET }
  );
  const connect = (name = ROOM, over: Record<string, unknown> = {}) => {
    const ws = new FakeSocket({
      room: name,
      conn: `c${sockets.length + 1}`,
      key: null,
      presence: null,
      lastTrackAt: 0,
      validUntil: Date.now() + HOUR,
      ...over,
    });
    sockets.push(ws);
    return ws;
  };
  const say = (ws: FakeSocket, message: unknown) =>
    room.webSocketMessage(ws, JSON.stringify(message));
  const publish = async (message = '{"type":"broadcast","event":"kicked"}') => {
    const res = await room.fetch(
      new Request('https://room/broadcast', { method: 'POST', body: message })
    );
    return (await res.json()) as { delivered: number };
  };
  return { room, sockets, connect, say, publish };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date'] });
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('la durée d’une connexion', () => {
  it('une diffusion du serveur coupe celle qui n’a pas renouvelé, et ne lui arrive pas', async () => {
    const { connect, publish } = await setup();
    const late = connect(CHAT);
    const renewed = connect(CHAT, { validUntil: Date.now() + 2 * HOUR });
    vi.setSystemTime(Date.now() + HOUR + 1);
    expect(await publish()).toEqual({ delivered: 1 });
    expect(late.closedWith).toBe(4401);
    expect(late.sent).toEqual([]);
    expect(renewed.closedWith).toBeNull();
    expect(renewed.sent).toHaveLength(1);
  });

  it('un ticket valide renouvelle pour une heure', async () => {
    const { signTicket } = await import('../../realtime/protocol');
    const { connect, say, publish } = await setup();
    const ws = connect(CHAT);
    vi.setSystemTime(Date.now() + 50 * 60_000);
    const ticket = await signTicket({
      secret: SECRET,
      room: CHAT,
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    await say(ws, { type: 'renew', ticket });
    vi.setSystemTime(Date.now() + 50 * 60_000);
    expect(await publish()).toEqual({ delivered: 1 });
    expect(ws.closedWith).toBeNull();
  });

  it.each([
    ['forgé', 'autre'.repeat(10), CHAT],
    ['d’un autre salon', SECRET, 'library:chat:r2'],
  ])('un ticket %s ne renouvelle rien', async (_n, secret, room) => {
    const { signTicket } = await import('../../realtime/protocol');
    const { connect, say, publish } = await setup();
    const ws = connect(CHAT);
    const ticket = await signTicket({
      secret,
      room,
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    await say(ws, { type: 'renew', ticket });
    vi.setSystemTime(Date.now() + HOUR + 1);
    await publish();
    expect(ws.closedWith).toBe(4401);
  });

  it('un écran échu ne parle plus, et sa présence disparaît pour les autres', async () => {
    const { connect, say } = await setup();
    const late = connect(ROOM, {
      key: 'a',
      presence: { gx: 1 },
    });
    const other = connect(ROOM, { validUntil: Date.now() + 2 * HOUR });
    vi.setSystemTime(Date.now() + HOUR + 1);
    await say(late, { type: 'broadcast', event: 'move', payload: { gx: 9 } });
    expect(late.closedWith).toBe(4401);
    expect(other.parsed()).toEqual([{ type: 'presence_state', entries: [] }]);
  });

  it('un écran échu qui se tait est coupé dès que le salon sert les autres', async () => {
    const { connect, say } = await setup();
    const silent = connect(ROOM, { key: 'a', presence: { gx: 1 } });
    const other = connect(ROOM, { validUntil: Date.now() + 2 * HOUR });
    const third = connect(ROOM, { validUntil: Date.now() + 2 * HOUR });
    vi.setSystemTime(Date.now() + HOUR + 1);
    await say(other, { type: 'broadcast', event: 'move', payload: { gx: 9 } });
    expect(silent.closedWith).toBe(4401);
    expect(silent.sent).toEqual([]);
    expect(third.parsed()).toEqual([
      { type: 'presence_state', entries: [] },
      { type: 'broadcast', event: 'move', payload: { gx: 9 } },
    ]);
  });
});

describe('écrire dans un salon', () => {
  it('un message est relayé aux autres, sans écho', async () => {
    const { connect, say } = await setup();
    const a = connect();
    const b = connect();
    await say(a, { type: 'broadcast', event: 'move', payload: { gx: 4 } });
    expect(b.parsed()).toEqual([
      { type: 'broadcast', event: 'move', payload: { gx: 4 } },
    ]);
    expect(a.sent).toEqual([]);
  });

  it.each(['library:chat:r1', 'library:tenant:t1', 'library:user:u1'])(
    '%s ne s’écrit pas depuis un écran',
    async (name) => {
      const { connect, say } = await setup();
      const a = connect(name);
      const b = connect(name);
      await say(a, { type: 'broadcast', event: 'kicked', payload: { u: 1 } });
      await say(a, { type: 'track', key: 'a', state: { gx: 1 } });
      expect(b.sent).toEqual([]);
      expect(a.deserializeAttachment()).toMatchObject({ presence: null });
    }
  );

  it('au-delà de 20 messages par seconde : ignorés, puis la fenêtre repart', async () => {
    const { connect, say } = await setup();
    const a = connect();
    const b = connect();
    const send = () =>
      say(a, { type: 'broadcast', event: 'move', payload: { gx: 1 } });
    for (let i = 0; i < 25; i++) await send();
    expect(b.sent).toHaveLength(20);
    vi.setSystemTime(Date.now() + 1000);
    await send();
    expect(b.sent).toHaveLength(21);
  });

  it('un message illisible est ignoré', async () => {
    const { connect, room } = await setup();
    const a = connect();
    const b = connect();
    await room.webSocketMessage(a, 'pas du json');
    await room.webSocketMessage(a, new ArrayBuffer(2));
    expect(b.sent).toEqual([]);
  });
});

describe('la présence', () => {
  it('annoncée aux autres, gardée sur la connexion', async () => {
    const { connect, say } = await setup();
    const a = connect();
    const b = connect();
    await say(a, { type: 'track', key: 'a', state: { gx: 1 } });
    expect(b.parsed()).toEqual([
      { type: 'presence_join', conn: 'c1', key: 'a', state: { gx: 1 } },
    ]);
    expect(a.sent).toEqual([]);
    expect(a.deserializeAttachment()).toMatchObject({
      key: 'a',
      presence: { gx: 1 },
    });
  });

  it('deux présences trop rapprochées : la seconde est ignorée', async () => {
    const { connect, say } = await setup();
    const a = connect();
    const b = connect();
    await say(a, { type: 'track', key: 'a', state: { gx: 1 } });
    await say(a, { type: 'track', key: 'a', state: { gx: 2 } });
    expect(b.sent).toHaveLength(1);
    vi.setSystemTime(Date.now() + 500);
    await say(a, { type: 'track', key: 'a', state: { gx: 3 } });
    expect(b.sent).toHaveLength(2);
  });

  it('se retirer efface la présence pour les autres', async () => {
    const { connect, say } = await setup();
    const a = connect(ROOM, { key: 'a', presence: { gx: 1 } });
    const b = connect();
    await say(a, { type: 'untrack' });
    expect(b.parsed()).toEqual([{ type: 'presence_state', entries: [] }]);
  });

  it('un départ envoie ce qui reste du salon', async () => {
    const { connect, room, sockets } = await setup();
    const a = connect(ROOM, { key: 'a', presence: { gx: 1 } });
    const b = connect(ROOM, { key: 'b', presence: { gx: 2 } });
    const c = connect();
    sockets.splice(0, 1);
    await room.webSocketClose(a, 1000, '');
    const expected = {
      type: 'presence_state',
      entries: [{ conn: 'c2', key: 'b', state: { gx: 2 } }],
    };
    expect(c.parsed()).toEqual([expected]);
    expect(b.parsed()).toEqual([expected]);
  });

  it('un départ d’un salon du serveur n’envoie rien', async () => {
    const { connect, room, sockets } = await setup();
    const a = connect(CHAT);
    const b = connect(CHAT);
    sockets.splice(0, 1);
    await room.webSocketClose(a, 1000, '');
    expect(b.sent).toEqual([]);
  });
});

describe('les autres salons', () => {
  it('la présence des casters garde sa forme', async () => {
    const { room, sockets } = await setup();
    const a = new FakeSocket({
      room: 'caster:presence',
      user: 'staff-1',
      presence: null,
      lastPresenceAt: 0,
    });
    sockets.push(a);
    await room.webSocketMessage(
      a,
      JSON.stringify({ type: 'presence', state: { name: 'Lune' } })
    );
    expect(a.parsed()).toEqual([
      {
        type: 'presence',
        users: [{ user: 'staff-1', state: { name: 'Lune' } }],
      },
    ]);
  });

  it('une connexion sans échéance n’est jamais coupée', async () => {
    const { room, sockets, publish } = await setup();
    const a = new FakeSocket({ room: 'demandes:team:t1', user: 'u1' });
    sockets.push(a);
    expect(room).toBeDefined();
    vi.setSystemTime(Date.now() + 100 * HOUR);
    expect(await publish()).toEqual({ delivered: 1 });
    expect(a.closedWith).toBeNull();
  });
});
