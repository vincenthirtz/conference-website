// tests/unit/casterTwitchChatClient.test.ts
//
// Lot 4 du cockpit caster web — logique testable sans navigateur :
//  - utils/caster/twitchChatClient : handshake ANONYME, PING→PONG, dispatch
//    PRIVMSG / USERNOTICE / CLEARCHAT / CLEARMSG / NOTICE, reconnexion backoff,
//    normalisation de chaîne — le tout sur un WebSocket mocké (aucune dépendance) ;
//  - utils/caster/eventsubClient : mapping des notifications + cycle
//    welcome → souscription serveur → ready / unavailable / reconnect ;
//  - utils/caster/mvpPollState : cycle de vote du poll MVP (extrait en module
//    PUR justement pour être testable hors React).

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANONYMOUS_PASS,
  CAP_REQ,
  CONNECT_TIMEOUT_MS,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_DELAY_MS,
  TwitchChatClient,
  backoffDelayMs,
  normalizeChannel,
  type ChatClearPayload,
  type WebSocketLike,
} from '@/utils/caster/twitchChatClient';
import {
  EventSubClient,
  mapEventSubNotification,
  type EventSubEvent,
} from '@/utils/caster/eventsubClient';
import {
  MIN_CANDIDATES,
  buildPollSnapshot,
  castVote,
  createPollState,
  resetVotes,
  startPoll,
  stopPoll,
  syncCandidates,
} from '@/utils/caster/mvpPollState';
import type { ChatEvent, ChatMessage } from '@/utils/caster/twitchProtocol';

// ---------------------------------------------------------------------------
// Mock WebSocket minimal — même contrat que le vrai pour le sous-ensemble
// utilisé. close() ne déclenche PAS onclose (l'event close est asynchrone) :
// les tests pilotent la fermeture côté serveur via serverClose().
// ---------------------------------------------------------------------------

class MockWs implements WebSocketLike {
  static instances: MockWs[] = [];
  sent: string[] = [];
  closed = false;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;

  constructor(public url: string) {
    MockWs.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  /** Simule l'ouverture de la socket (déclenche le handshake). */
  open(): void {
    this.onopen?.();
  }

  /** Une ou plusieurs lignes IRC brutes (séparateur \r\n comme Twitch). */
  receive(...lines: string[]): void {
    this.onmessage?.({ data: lines.join('\r\n') + '\r\n' });
  }

  /** Frame JSON (EventSub). */
  receiveJson(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  serverClose(): void {
    this.onclose?.();
  }
}

function makeChatClient(): TwitchChatClient {
  return new TwitchChatClient({
    createWebSocket: (url) => new MockWs(url),
    makeNick: () => 'justinfan12345',
  });
}

/** Ouvre la socket + joue le 001 pour amener le client à l'état connecté. */
async function connectChat(
  client: TwitchChatClient,
  channel = 'womens_cup'
): Promise<MockWs> {
  const promise = client.connect(channel);
  const ws = MockWs.instances[MockWs.instances.length - 1];
  ws.open();
  ws.receive(':tmi.twitch.tv 001 justinfan12345 :Welcome, GLHF!');
  await promise;
  return ws;
}

afterEach(() => {
  MockWs.instances = [];
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// normalizeChannel
// ---------------------------------------------------------------------------

describe('normalizeChannel', () => {
  it('accepte les formes usuelles', () => {
    expect(normalizeChannel('Womens_Cup')).toBe('womens_cup');
    expect(normalizeChannel('#womens_cup')).toBe('womens_cup');
    expect(normalizeChannel('@womens_cup ')).toBe('womens_cup');
    expect(normalizeChannel('twitch.tv/womens_cup')).toBe('womens_cup');
    expect(normalizeChannel('https://www.twitch.tv/womens_cup?x=1')).toBe(
      'womens_cup'
    );
  });

  it('rend une chaîne vide quand rien n’est exploitable', () => {
    expect(normalizeChannel('')).toBe('');
    expect(normalizeChannel('   ')).toBe('');
    expect(normalizeChannel('###')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Handshake / transport
// ---------------------------------------------------------------------------

describe('TwitchChatClient — handshake anonyme', () => {
  it('envoie CAP/PASS/NICK/JOIN sans aucun token', async () => {
    const client = makeChatClient();
    const ws = await connectChat(client);

    expect(ws.sent[0]).toBe(CAP_REQ);
    expect(ws.sent[1]).toBe(`PASS ${ANONYMOUS_PASS}`);
    expect(ws.sent[2]).toBe('NICK justinfan12345');
    expect(ws.sent[3]).toBe('JOIN #womens_cup');
    // Garde-fou sécurité : jamais d'oauth: dans le handshake navigateur.
    expect(ws.sent.join('\n')).not.toMatch(/oauth:/i);
  });

  it('résout ok + émet `connected` sur 001', async () => {
    const client = makeChatClient();
    const connected: string[] = [];
    client.on('connected', ({ channel }) => connected.push(channel));

    const promise = client.connect('#Womens_Cup');
    const ws = MockWs.instances[0];
    ws.open();
    ws.receive(':tmi.twitch.tv 001 justinfan12345 :Welcome, GLHF!');
    const res = await promise;

    expect(res).toEqual({ ok: true, channel: 'womens_cup' });
    expect(connected).toEqual(['womens_cup']);
    expect(client.status().connected).toBe(true);
  });

  it('refuse une chaîne vide sans ouvrir de socket', async () => {
    const client = makeChatClient();
    const res = await client.connect('  ');
    expect(res).toEqual({ error: 'invalid-channel' });
    expect(MockWs.instances).toHaveLength(0);
  });

  it('répond PONG à un PING', async () => {
    const client = makeChatClient();
    const ws = await connectChat(client);
    const before = ws.sent.length;
    ws.receive('PING :tmi.twitch.tv');
    expect(ws.sent.slice(before)).toEqual(['PONG :tmi.twitch.tv']);
  });

  it('rend { error: timeout } si aucun 001 n’arrive', async () => {
    vi.useFakeTimers();
    const client = makeChatClient();
    const promise = client.connect('womens_cup');
    MockWs.instances[0].open();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + 10);
    await expect(promise).resolves.toEqual({ error: 'timeout' });
    expect(MockWs.instances[0].closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

describe('TwitchChatClient — dispatch des lignes', () => {
  it('projette un PRIVMSG en message avec badges et couleur', async () => {
    const client = makeChatClient();
    const messages: ChatMessage[] = [];
    client.on('message', (m) => messages.push(m));
    const ws = await connectChat(client);

    ws.receive(
      '@badges=moderator/1,subscriber/12;color=#00FF00;display-name=Alpha;id=abc ' +
        ':alpha!alpha@alpha.tmi.twitch.tv PRIVMSG #womens_cup :salut le chat !'
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      nick: 'alpha',
      displayName: 'Alpha',
      color: '#00FF00',
      message: 'salut le chat !',
      isMod: true,
      isSub: true,
      isBroadcaster: false,
    });
  });

  it('remonte un cheer en event EN PLUS du message', async () => {
    const client = makeChatClient();
    const messages: ChatMessage[] = [];
    const events: ChatEvent[] = [];
    client.on('message', (m) => messages.push(m));
    client.on('event', (e) => events.push(e));
    const ws = await connectChat(client);

    ws.receive(
      '@bits=100;display-name=Bravo :bravo!bravo@bravo.tmi.twitch.tv ' +
        'PRIVMSG #womens_cup :Cheer100 GG'
    );

    expect(messages).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'cheer', bits: 100 });
  });

  it('projette un USERNOTICE resub en event', async () => {
    const client = makeChatClient();
    const events: ChatEvent[] = [];
    client.on('event', (e) => events.push(e));
    const ws = await connectChat(client);

    ws.receive(
      '@msg-id=resub;display-name=Charlie;msg-param-sub-plan=2000;' +
        'msg-param-cumulative-months=7;system-msg=Charlie\\ssubscribed ' +
        ':tmi.twitch.tv USERNOTICE #womens_cup :toujours là'
    );

    expect(events[0]).toMatchObject({
      kind: 'resub',
      displayName: 'Charlie',
      tier: '2',
      months: 7,
      message: 'toujours là',
    });
  });

  it('distingue CLEARCHAT global, timeout et CLEARMSG', async () => {
    const client = makeChatClient();
    const clears: ChatClearPayload[] = [];
    client.on('clear', (c) => clears.push(c));
    const ws = await connectChat(client);

    ws.receive(':tmi.twitch.tv CLEARCHAT #womens_cup');
    ws.receive('@ban-duration=600 :tmi.twitch.tv CLEARCHAT #womens_cup :troll');
    ws.receive(':tmi.twitch.tv CLEARCHAT #womens_cup :spammeur');
    ws.receive(
      '@login=troll;target-msg-id=xyz :tmi.twitch.tv CLEARMSG #womens_cup :vilain message'
    );

    expect(clears[0]).toMatchObject({ scope: 'all', user: null });
    expect(clears[1]).toMatchObject({
      scope: 'user',
      user: 'troll',
      duration: 600,
    });
    // Ban permanent : pas de ban-duration.
    expect(clears[2]).toMatchObject({
      scope: 'user',
      user: 'spammeur',
      duration: null,
    });
    expect(clears[3]).toMatchObject({
      scope: 'message',
      user: 'troll',
      targetMsgId: 'xyz',
      message: 'vilain message',
    });
  });

  it('remonte les NOTICE', async () => {
    const client = makeChatClient();
    const notices: { message: string; msgId: string }[] = [];
    client.on('notice', (n) => notices.push(n));
    const ws = await connectChat(client);

    ws.receive(
      '@msg-id=msg_slowmode :tmi.twitch.tv NOTICE #womens_cup :Slow mode activé'
    );
    expect(notices[0]).toEqual({
      msgId: 'msg_slowmode',
      message: 'Slow mode activé',
    });
  });

  it('traite plusieurs lignes d’un même frame', async () => {
    const client = makeChatClient();
    const messages: ChatMessage[] = [];
    client.on('message', (m) => messages.push(m));
    const ws = await connectChat(client);

    ws.receive(
      ':a!a@a.tmi.twitch.tv PRIVMSG #womens_cup :un',
      'PING :tmi.twitch.tv',
      ':b!b@b.tmi.twitch.tv PRIVMSG #womens_cup :deux'
    );

    expect(messages.map((m) => m.message)).toEqual(['un', 'deux']);
    expect(ws.sent).toContain('PONG :tmi.twitch.tv');
  });

  it('ferme la socket sur RECONNECT (Twitch demande une bascule)', async () => {
    const client = makeChatClient();
    const ws = await connectChat(client);
    ws.receive(':tmi.twitch.tv RECONNECT');
    expect(ws.closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reconnexion
// ---------------------------------------------------------------------------

describe('TwitchChatClient — reconnexion', () => {
  it('backoff exponentiel plafonné', () => {
    expect(backoffDelayMs(0)).toBe(1000);
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(4)).toBe(16_000);
    expect(backoffDelayMs(20)).toBe(MAX_RECONNECT_DELAY_MS);
  });

  it('rouvre une socket après une fermeture serveur', async () => {
    vi.useFakeTimers();
    const client = makeChatClient();
    const promise = client.connect('womens_cup');
    const ws = MockWs.instances[0];
    ws.open();
    ws.receive(':tmi.twitch.tv 001 justinfan12345 :Welcome, GLHF!');
    await promise;

    const disconnects: unknown[] = [];
    client.on('disconnected', (p) => disconnects.push(p));

    ws.serverClose();
    expect(disconnects).toHaveLength(1);
    expect(client.status().reconnecting).toBe(true);

    vi.advanceTimersByTime(backoffDelayMs(0) + 5);
    expect(MockWs.instances).toHaveLength(2);
    expect(MockWs.instances[1].url).toBe(ws.url);
  });

  it('abandonne après MAX_RECONNECT_ATTEMPTS et émet reconnectFailed une fois', async () => {
    vi.useFakeTimers();
    const client = makeChatClient();
    const promise = client.connect('womens_cup');
    MockWs.instances[0].open();
    MockWs.instances[0].receive(':tmi.twitch.tv 001 x :Welcome, GLHF!');
    await promise;

    const failures: { attempts: number }[] = [];
    client.on('reconnectFailed', (p) => failures.push(p));

    // Chaque tentative rouvre une socket qui se referme aussitôt.
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS + 2; i++) {
      const current = MockWs.instances[MockWs.instances.length - 1];
      current.serverClose();
      await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS + 10);
    }

    expect(failures).toHaveLength(1);
    expect(failures[0].attempts).toBe(MAX_RECONNECT_ATTEMPTS);
  });

  it('une déconnexion manuelle ne reconnecte pas', async () => {
    vi.useFakeTimers();
    const client = makeChatClient();
    const promise = client.connect('womens_cup');
    MockWs.instances[0].open();
    MockWs.instances[0].receive(':tmi.twitch.tv 001 x :Welcome, GLHF!');
    await promise;

    client.disconnect();
    expect(client.status()).toMatchObject({
      connected: false,
      channel: null,
      reconnecting: false,
    });
    vi.advanceTimersByTime(MAX_RECONNECT_DELAY_MS * 2);
    expect(MockWs.instances).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// EventSub
// ---------------------------------------------------------------------------

describe('mapEventSubNotification', () => {
  it('mappe channel.follow', () => {
    expect(
      mapEventSubNotification('channel.follow', { user_name: 'Delta' })
    ).toEqual({
      kind: 'follow',
      msgId: 'follow',
      displayName: 'Delta',
      message: '',
      systemMsg: '',
    });
  });

  it('mappe channel.shoutout.receive avec le nombre de viewers', () => {
    expect(
      mapEventSubNotification('channel.shoutout.receive', {
        from_broadcaster_user_name: 'Echo',
        viewer_count: 42,
      })
    ).toMatchObject({ kind: 'shoutout', displayName: 'Echo', viewers: 42 });
  });

  it('ignore les types non gérés et les payloads vides', () => {
    expect(mapEventSubNotification('channel.cheer', { x: 1 })).toBeNull();
    expect(mapEventSubNotification('channel.follow', null)).toBeNull();
  });
});

function makeEventSub(
  subscribe: (sessionId: string) => Promise<{
    created: string[];
    failed: { type: string; status: number; message: string }[];
  }>
): EventSubClient {
  return new EventSubClient({
    subscribe,
    createWebSocket: (url) => new MockWs(url),
  });
}

const WELCOME = {
  metadata: { message_type: 'session_welcome' },
  payload: { session: { id: 'sess-1', keepalive_timeout_seconds: 10 } },
};

describe('EventSubClient', () => {
  it('POSTe le session_id au welcome puis passe ready', async () => {
    const seen: string[] = [];
    const client = makeEventSub(async (sid) => {
      seen.push(sid);
      return { created: ['channel.follow'], failed: [] };
    });
    const phases: string[] = [];
    client.on('phase', (p) => phases.push(p.phase));

    client.start();
    MockWs.instances[0].receiveJson(WELCOME);
    await vi.waitFor(() => expect(phases).toContain('ready'));

    expect(seen).toEqual(['sess-1']);
    expect(phases).toEqual(['connecting', 'subscribing', 'ready']);
  });

  it('rend les notifications en events normalisés', async () => {
    const client = makeEventSub(async () => ({
      created: ['channel.follow'],
      failed: [],
    }));
    const events: EventSubEvent[] = [];
    client.on('event', (e) => events.push(e));

    client.start();
    const ws = MockWs.instances[0];
    ws.receiveJson(WELCOME);
    ws.receiveJson({
      metadata: {
        message_type: 'notification',
        subscription_type: 'channel.follow',
      },
      payload: { event: { user_name: 'Foxtrot' } },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'follow', displayName: 'Foxtrot' });
  });

  it('passe « unavailable » (sans boucler) si la route répond 404', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    const client = makeEventSub(async () => {
      throw err;
    });
    const phases: { phase: string; reason?: string }[] = [];
    client.on('phase', (p) => phases.push(p));

    client.start();
    MockWs.instances[0].receiveJson(WELCOME);
    await vi.waitFor(() =>
      expect(phases.some((p) => p.phase === 'unavailable')).toBe(true)
    );

    const last = phases[phases.length - 1];
    expect(last).toMatchObject({
      phase: 'unavailable',
      reason: 'not-implemented',
    });
    // Le client s'est arrêté : une fermeture ne relance pas de socket.
    MockWs.instances[0].serverClose();
    expect(MockWs.instances).toHaveLength(1);
  });

  it('passe « unavailable / missing-scope » si toutes les souscriptions échouent', async () => {
    const client = makeEventSub(async () => ({
      created: [],
      failed: [
        { type: 'channel.follow', status: 403, message: 'scope manquant' },
      ],
    }));
    const phases: { phase: string; reason?: string; detail?: string }[] = [];
    client.on('phase', (p) => phases.push(p));

    client.start();
    MockWs.instances[0].receiveJson(WELCOME);
    await vi.waitFor(() =>
      expect(phases.some((p) => p.phase === 'unavailable')).toBe(true)
    );

    expect(phases[phases.length - 1]).toMatchObject({
      phase: 'unavailable',
      reason: 'missing-scope',
      detail: 'scope manquant',
    });
  });

  it('suit session_reconnect SANS re-souscrire', async () => {
    let calls = 0;
    const client = makeEventSub(async () => {
      calls++;
      return { created: ['channel.follow'], failed: [] };
    });

    client.start();
    const first = MockWs.instances[0];
    first.receiveJson(WELCOME);
    await vi.waitFor(() => expect(calls).toBe(1));

    first.receiveJson({
      metadata: { message_type: 'session_reconnect' },
      payload: { session: { reconnect_url: 'wss://eventsub.example/ws?r=1' } },
    });
    expect(MockWs.instances).toHaveLength(2);
    expect(MockWs.instances[1].url).toBe('wss://eventsub.example/ws?r=1');

    MockWs.instances[1].receiveJson(WELCOME);
    await Promise.resolve();
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Poll MVP (machine pure)
// ---------------------------------------------------------------------------

const CANDIDATES = [
  { id: '1', label: 'Joueuse A' },
  { id: '2', label: 'Joueuse B' },
  { id: '3', label: 'Joueuse C' },
];

describe('mvpPollState — cycle de vote', () => {
  it('refuse de démarrer sous MIN_CANDIDATES', () => {
    expect(startPoll(createPollState(), CANDIDATES.slice(0, 1))).toBeNull();
    expect(MIN_CANDIDATES).toBe(2);
  });

  it('ignore les votes tant que le poll est fermé', () => {
    const s = createPollState();
    const r = castVote(s, CANDIDATES, 'alpha', '1');
    expect(r.accepted).toBe(false);
    expect(r.state).toBe(s);
  });

  it('un utilisateur = un vote, le DERNIER gagne', () => {
    let s = startPoll(createPollState(), CANDIDATES)!;
    s = castVote(s, CANDIDATES, 'alpha', '1').state;
    s = castVote(s, CANDIDATES, 'alpha', '2').state;
    s = castVote(s, CANDIDATES, 'bravo', 'Joueuse b').state;

    const snap = buildPollSnapshot(s, CANDIDATES, 'Vote MVP');
    expect(snap.total).toBe(2);
    expect(snap.candidates.map((c) => c.count)).toEqual([0, 2, 0]);
    expect(snap.leaderId).toBe('2');
    expect(snap.candidates[1].percent).toBe(100);
  });

  it('rejette un argument qui ne résout aucune candidate', () => {
    const s = startPoll(createPollState(), CANDIDATES)!;
    expect(castVote(s, CANDIDATES, 'alpha', '9').accepted).toBe(false);
    expect(castVote(s, CANDIDATES, 'alpha', 'zzz').accepted).toBe(false);
    expect(castVote(s, CANDIDATES, '', '1').accepted).toBe(false);
  });

  it('ré-émettre le même vote ne change pas l’état (pas de re-render)', () => {
    let s = startPoll(createPollState(), CANDIDATES)!;
    s = castVote(s, CANDIDATES, 'alpha', '1').state;
    const again = castVote(s, CANDIDATES, 'alpha', '1');
    expect(again.accepted).toBe(true);
    expect(again.state).toBe(s);
  });

  it('démarrer remet les votes à zéro, fermer les conserve', () => {
    let s = startPoll(createPollState(), CANDIDATES, '2026-01-01T10:00:00Z')!;
    s = castVote(s, CANDIDATES, 'alpha', '1').state;
    s = stopPoll(s, '2026-01-01T10:05:00Z');
    expect(s.isOpen).toBe(false);
    expect(s.endedAt).toBe('2026-01-01T10:05:00Z');
    expect(buildPollSnapshot(s, CANDIDATES, 'T').total).toBe(1);

    const restarted = startPoll(s, CANDIDATES, '2026-01-01T11:00:00Z')!;
    expect(restarted.votes.size).toBe(0);
    expect(restarted.endedAt).toBeNull();
    expect(restarted.isOpen).toBe(true);
  });

  it('reset vide les votes sans fermer le poll', () => {
    let s = startPoll(createPollState(), CANDIDATES)!;
    s = castVote(s, CANDIDATES, 'alpha', '1').state;
    s = resetVotes(s);
    expect(s.isOpen).toBe(true);
    expect(s.votes.size).toBe(0);
    // Idempotent : rien à vider ⇒ même référence.
    expect(resetVotes(s)).toBe(s);
  });

  it('purge les votes orphelins quand une candidate disparaît', () => {
    let s = startPoll(createPollState(), CANDIDATES)!;
    s = castVote(s, CANDIDATES, 'alpha', '3').state;
    s = castVote(s, CANDIDATES, 'bravo', '1').state;

    const shorter = CANDIDATES.slice(0, 2);
    const synced = syncCandidates(s, shorter);
    expect(synced.votes.size).toBe(1);
    expect(buildPollSnapshot(synced, shorter, 'T').total).toBe(1);
    // Liste inchangée ⇒ même référence (aucune republication inutile).
    expect(syncCandidates(synced, shorter)).toBe(synced);
  });

  it('le snapshot a la shape attendue par l’overlay MVP', () => {
    let s = startPoll(createPollState(), CANDIDATES, '2026-01-01T10:00:00Z')!;
    s = castVote(s, CANDIDATES, 'alpha', '2').state;
    const snap = buildPollSnapshot(s, CANDIDATES, 'Vote MVP');

    expect(Object.keys(snap).sort()).toEqual(
      [
        'candidates',
        'endedAt',
        'isOpen',
        'leaderId',
        'startedAt',
        'title',
        'total',
      ].sort()
    );
    expect(snap.candidates[0]).toEqual({
      id: '1',
      label: 'Joueuse A',
      count: 0,
      percent: 0,
    });
  });
});
