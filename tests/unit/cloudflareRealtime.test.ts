// Connexion des écrans aux salons du Worker (utils/realtime/cloudflareRealtime.ts,
// docs/REALTIME-DO.md étape 3), contre une fausse WebSocket.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'jeton-joueuse' } },
      }),
    },
  },
}));

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static all: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closedWith: number | null = null;
  private handlers = new Map<string, ((e: { data?: unknown }) => void)[]>();
  constructor(public url: string) {
    FakeWebSocket.all.push(this);
  }
  addEventListener(type: string, fn: (e: { data?: unknown }) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code: number) {
    this.closedWith = code;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }
  emit(type: string, data?: unknown) {
    if (type === 'open') this.readyState = FakeWebSocket.OPEN;
    for (const fn of this.handlers.get(type) ?? []) fn({ data });
  }
}

const ID = '3f2a9c1e-0000-4000-8000-000000000001';
let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  return import('@/utils/realtime/cloudflareRealtime');
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FakeWebSocket.all = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  fetchMock = vi.fn(async () =>
    Response.json({ room: 'x', ticket: 'abc.def', expiresAt: 0 })
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('salon public', () => {
  it('une seule connexion partagée, messages distribués, fermeture au dernier départ', async () => {
    const { joinRoom } = await load();
    const a = { onMessage: vi.fn(), onStatus: vi.fn() };
    const b = { onMessage: vi.fn() };
    const leaveA = joinRoom(`draft:${ID}`, a);
    const leaveB = joinRoom(`draft:${ID}`, b);
    await flush();
    expect(FakeWebSocket.all).toHaveLength(1);
    const ws = FakeWebSocket.all[0];
    expect(ws.url).toBe(
      `wss://realtime.owwomenscup.fr/rooms/${encodeURIComponent(`draft:${ID}`)}`
    );
    expect(fetchMock).not.toHaveBeenCalled();

    ws.emit('open');
    expect(a.onStatus).toHaveBeenCalledWith('SUBSCRIBED');
    ws.emit(
      'message',
      JSON.stringify({
        type: 'change',
        table: 'match_drafts',
        op: 'UPDATE',
        id: ID,
        at: 1,
      })
    );
    ws.emit('message', 'pong');
    expect(a.onMessage).toHaveBeenCalledTimes(1);
    expect(b.onMessage).toHaveBeenCalledTimes(1);

    leaveA();
    expect(ws.closedWith).toBeNull();
    leaveB();
    expect(ws.closedWith).toBe(1000);
  });

  it('se reconnecte seul après une coupure', async () => {
    vi.useFakeTimers();
    const { joinRoom } = await load();
    const l = { onMessage: vi.fn(), onStatus: vi.fn() };
    const leave = joinRoom('caster:themes', l);
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeWebSocket.all[0];
    first.emit('open');
    first.readyState = FakeWebSocket.CLOSED;
    first.emit('close');
    expect(l.onStatus).toHaveBeenCalledWith('CLOSED');
    await vi.advanceTimersByTimeAsync(1600);
    expect(FakeWebSocket.all).toHaveLength(2);
    leave();
  });
});

describe('salon privé', () => {
  it('demande un ticket à l’API avec la session, puis le joint à l’adresse', async () => {
    const { joinRoom } = await load();
    const leave = joinRoom(`demandes:team:${ID}`, { onMessage: vi.fn() });
    await flush();
    await flush();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/player/realtime/ticket?room=${encodeURIComponent(`demandes:team:${ID}`)}`
    );
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer jeton-joueuse'
    );
    expect(FakeWebSocket.all[0].url).toMatch(/\?ticket=abc\.def$/);
    leave();
  });

  it('refus de l’API (403) : abandon, sans boucle de reconnexion', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));
    const { joinRoom } = await load();
    const l = { onMessage: vi.fn(), onStatus: vi.fn() };
    const leave = joinRoom(`matches:tournament:${ID}`, l);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.all).toHaveLength(0);
    expect(l.onStatus).toHaveBeenCalledWith('CHANNEL_ERROR');
    leave();
  });
});

describe('présence', () => {
  it('envoyée à l’ouverture, puis une mise à jour par seconde au plus (la dernière gagne)', async () => {
    vi.useFakeTimers();
    const { joinRoom, setRoomPresence } = await load();
    const leave = joinRoom('caster:presence', { onMessage: vi.fn() });
    setRoomPresence('caster:presence', { displayName: 'Ana' });
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeWebSocket.all[0];
    ws.emit('open');
    expect(ws.sent).toEqual([
      JSON.stringify({ type: 'presence', state: { displayName: 'Ana' } }),
    ]);
    setRoomPresence('caster:presence', {
      displayName: 'Ana',
      activeScene: 'a',
    });
    setRoomPresence('caster:presence', {
      displayName: 'Ana',
      activeScene: 'b',
    });
    expect(ws.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1200);
    expect(ws.sent).toHaveLength(2);
    expect(JSON.parse(ws.sent[1]).state.activeScene).toBe('b');
    leave();
  });
});
