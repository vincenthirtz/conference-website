// tests/unit/casterObsClient.test.ts
//
// Client OBS WebSocket v5 navigateur (utils/caster/obsClient) — lot 3 du
// cockpit caster web. Couvre la logique pure isolable :
//  - secret d'auth sha256 (WebCrypto) validé contre node:crypto (référence de
//    l'implémentation desktop utils/obsAuth.js) ;
//  - construction du message Identify (op 1) ;
//  - politique de backoff de reconnexion (mêmes constantes que le desktop) ;
//  - parsing des op 0/2/5/7 + corrélation requestId/réponse + timeout, via un
//    mock WebSocket in-test (aucune dépendance).
// Et le payload pur du setup des scènes OBS (buildOverlaySceneSetup).

import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONNECT_TIMEOUT_MS,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_DELAY_MS,
  OBS_EVENT_SUBSCRIPTIONS,
  ObsClient,
  REQUEST_TIMEOUT_MS,
  backoffDelayMs,
  buildIdentify,
  computeObsAuth,
  type WebSocketLike,
} from '@/utils/caster/obsClient';
import {
  OVERLAY_GAMEPLAY_TYPES,
  buildOverlaySceneSetup,
} from '@/utils/caster/obsOps';

// Référence : implémentation node:crypto du desktop (utils/obsAuth.js).
function nodeComputeAuth(
  password: string,
  challenge: string,
  salt: string
): string {
  const secret = createHash('sha256')
    .update(password + salt)
    .digest('base64');
  return createHash('sha256')
    .update(secret + challenge)
    .digest('base64');
}

// ---------------------------------------------------------------------------
// Mock WebSocket minimal — se comporte comme le WebSocket navigateur pour le
// sous-ensemble utilisé (send/close + handlers on*). close() ne déclenche PAS
// onclose synchrone (comme le vrai : l'event close est asynchrone) ; les tests
// pilotent la fermeture côté serveur via serverClose().
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

  /** Message entrant (objet sérialisé comme le ferait OBS). */
  receive(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  serverClose(): void {
    this.onclose?.();
  }

  sentMessages(): Array<{ op: number; d: Record<string, unknown> }> {
    return this.sent.map((s) => JSON.parse(s));
  }
}

function makeClient(): ObsClient {
  return new ObsClient({ createWebSocket: (url) => new MockWs(url) });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Attend qu'une condition devienne vraie en rendant la main à la boucle
 * d'événements entre deux essais.
 *
 * Pourquoi pas un simple `await flush()` : le handshake enchaîne PLUSIEURS
 * `await` — jusqu'à deux digests WebCrypto quand un mot de passe est fourni —
 * donc un tick unique ne suffit pas toujours. La suite passait en isolation mais
 * échouait par intermittence quand elle tournait en parallèle du reste
 * (worker chargé ⇒ le digest n'a pas rendu la main au premier tick).
 *
 * Le budget est compté en ITÉRATIONS et non en millisecondes : ainsi le helper
 * reste utilisable sans dépendre de l'horloge (et ne suppose pas de timers
 * réels côté appelant).
 */
async function waitFor(
  predicate: () => boolean,
  label = 'condition',
  maxTicks = 500
): Promise<void> {
  for (let i = 0; i < maxTicks && !predicate(); i++) {
    await flush();
  }
  if (!predicate()) {
    throw new Error(
      `waitFor: ${label} jamais satisfaite après ${maxTicks} ticks`
    );
  }
}

/** Connecte un client (handshake sans auth) et rend la socket mockée. */
async function connectClient(client: ObsClient): Promise<MockWs> {
  const p = client.connect({ host: 'localhost', port: 4455 });
  const ws = MockWs.instances[MockWs.instances.length - 1];
  ws.receive({ op: 0, d: {} });
  // L'Identify part après un await : on attend qu'il soit RÉELLEMENT envoyé
  // avant de simuler l'Identified, sinon la réponse arrive avant la demande.
  await waitFor(
    () => ws.sentMessages().some((m) => m.op === 1),
    'Identify envoyé'
  );
  ws.receive({ op: 2, d: {} });
  await expect(p).resolves.toEqual({ ok: true });
  return ws;
}

afterEach(() => {
  MockWs.instances = [];
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('computeObsAuth', () => {
  it('reproduit sha256(sha256(password+salt)+challenge) en base64 (vecteurs node:crypto)', async () => {
    const vectors: Array<[string, string, string]> = [
      ['supersecret', 'ObsChallenge123', 'ObsSalt456'],
      ['mot de passe accentué é€', 'c', 's'],
      ['', 'challenge', 'salt'],
      ['p@ss', 'y2AhkPj0hB2sJT3Wtx8ggmyE9ZLA9XPz', 'H7cLZzC9nqSuSVQPd2ZK0g=='],
    ];
    for (const [password, challenge, salt] of vectors) {
      expect(await computeObsAuth(password, challenge, salt)).toBe(
        nodeComputeAuth(password, challenge, salt)
      );
    }
  });
});

describe('buildIdentify', () => {
  it('op 1, rpcVersion 1 et les mêmes flags eventSubscriptions que le desktop (0x7FF)', async () => {
    const identify = await buildIdentify({});
    expect(identify.op).toBe(1);
    expect(identify.d.rpcVersion).toBe(1);
    expect(identify.d.eventSubscriptions).toBe(0x7ff);
    expect(OBS_EVENT_SUBSCRIPTIONS).toBe(0x7ff);
    expect(identify.d.authentication).toBeUndefined();
  });

  it("joint l'authentification si le Hello la demande ET qu'un mot de passe existe", async () => {
    const hello = { authentication: { challenge: 'ch', salt: 'sa' } };
    const withPw = await buildIdentify(hello, 'pw');
    expect(withPw.d.authentication).toBe(nodeComputeAuth('pw', 'ch', 'sa'));

    const noPw = await buildIdentify(hello);
    expect(noPw.d.authentication).toBeUndefined();

    const noChallenge = await buildIdentify({}, 'pw');
    expect(noChallenge.d.authentication).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

describe('backoffDelayMs', () => {
  it('double à chaque tentative, plafonné à 30 s (politique desktop)', () => {
    expect(backoffDelayMs(0)).toBe(1000);
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(2)).toBe(4000);
    expect(backoffDelayMs(4)).toBe(16000);
    expect(backoffDelayMs(5)).toBe(30000);
    expect(backoffDelayMs(19)).toBe(MAX_RECONNECT_DELAY_MS);
  });

  it('mêmes constantes que le desktop', () => {
    expect(MAX_RECONNECT_DELAY_MS).toBe(30_000);
    expect(MAX_RECONNECT_ATTEMPTS).toBe(20);
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(CONNECT_TIMEOUT_MS).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// Handshake (op 0 → op 1 → op 2)
// ---------------------------------------------------------------------------

describe('ObsClient — handshake', () => {
  it('répond au Hello par un Identify authentifié et résout ok sur Identified', async () => {
    const client = makeClient();
    const p = client.connect({ host: '127.0.0.1', port: 4455, password: 'pw' });
    const ws = MockWs.instances[0];
    expect(ws.url).toBe('ws://127.0.0.1:4455');

    ws.receive({
      op: 0,
      d: { authentication: { challenge: 'ch', salt: 'sa' } },
    });
    // Avec mot de passe, l'Identify attend DEUX digests WebCrypto : on attend la
    // condition plutôt qu'un tick (cf. waitFor).
    await waitFor(() => ws.sentMessages().length > 0, 'Identify envoyé');
    const identify = ws.sentMessages()[0] as {
      op: number;
      d: { authentication?: string; eventSubscriptions: number };
    };
    expect(identify.op).toBe(1);
    expect(identify.d.eventSubscriptions).toBe(0x7ff);
    expect(identify.d.authentication).toBe(nodeComputeAuth('pw', 'ch', 'sa'));

    ws.receive({ op: 2, d: { negotiatedRpcVersion: 1 } });
    await expect(p).resolves.toEqual({ ok: true });
    expect(client.status().connected).toBe(true);
  });

  it('résout {error} sur erreur socket et ignore les messages illisibles', async () => {
    const client = makeClient();
    const p = client.connect({});
    const ws = MockWs.instances[0];
    // Message non-JSON : ignoré sans jeter (comme le desktop).
    ws.onmessage?.({ data: 'pas du json' });
    ws.onerror?.();
    await expect(p).resolves.toEqual({ error: 'socket' });
    expect(client.status().connected).toBe(false);
  });

  it('timeout du handshake après CONNECT_TIMEOUT_MS sans Identified', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const p = client.connect({});
    const ws = MockWs.instances[0];
    ws.receive({ op: 0, d: {} }); // Hello sans suite (op 2 jamais reçu)
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    await expect(p).resolves.toEqual({ error: 'timeout' });
    expect(ws.closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Requêtes (op 6 / op 7)
// ---------------------------------------------------------------------------

describe('ObsClient — corrélation requêtes/réponses', () => {
  it('corrèle les op 7 par requestId, même hors ordre', async () => {
    const client = makeClient();
    const ws = await connectClient(client);

    const p1 = client.call('GetSceneList');
    const p2 = client.call('GetStreamStatus', { extra: true });
    const [, m1, m2] = ws.sentMessages(); // [identify, req1, req2]
    expect(m1.op).toBe(6);
    expect((m2.d as { requestData?: unknown }).requestData).toEqual({
      extra: true,
    });
    const id1 = (m1.d as { requestId: string }).requestId;
    const id2 = (m2.d as { requestId: string }).requestId;
    expect(id1).not.toBe(id2);

    // Réponses dans l'ordre inverse.
    ws.receive({
      op: 7,
      d: {
        requestId: id2,
        requestStatus: { result: true },
        responseData: { outputActive: true },
      },
    });
    ws.receive({
      op: 7,
      d: {
        requestId: id1,
        requestStatus: { result: true },
        responseData: { scenes: [{ sceneName: 'match' }] },
      },
    });

    await expect(p2).resolves.toEqual({ outputActive: true });
    await expect(p1).resolves.toEqual({ scenes: [{ sceneName: 'match' }] });
  });

  it('rejette avec le comment quand requestStatus.result est false', async () => {
    const client = makeClient();
    const ws = await connectClient(client);
    const p = client.call('SetCurrentProgramScene', { sceneName: 'nope' });
    const msg = ws.sentMessages()[1];
    ws.receive({
      op: 7,
      d: {
        requestId: (msg.d as { requestId: string }).requestId,
        requestStatus: { result: false, comment: 'No source was found' },
      },
    });
    await expect(p).rejects.toThrow('No source was found');
  });

  it('rejette Timeout après REQUEST_TIMEOUT_MS sans réponse', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const p0 = client.connect({});
    const ws = MockWs.instances[0];
    ws.receive({ op: 0, d: {} });
    await vi.advanceTimersByTimeAsync(0);
    ws.receive({ op: 2, d: {} });
    await expect(p0).resolves.toEqual({ ok: true });

    const p = client.call('GetSceneList');
    // Handler attaché AVANT l'avance des timers (sinon rejection non gérée).
    const assertion = expect(p).rejects.toThrow('Timeout');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('rejette immédiatement quand non connecté', async () => {
    const client = makeClient();
    await expect(client.call('GetSceneList')).rejects.toThrow(
      'Non connecté à OBS'
    );
  });

  it('rejette les requêtes en vol à la fermeture de la socket', async () => {
    const client = makeClient();
    const ws = await connectClient(client);
    const p = client.call('GetSceneList');
    ws.serverClose();
    await expect(p).rejects.toThrow('Connexion OBS fermée');
  });
});

// ---------------------------------------------------------------------------
// Événements (op 5)
// ---------------------------------------------------------------------------

describe('ObsClient — événements', () => {
  it('re-dispatche les events OBS écoutés par le desktop, avec leur eventData', async () => {
    const client = makeClient();
    const ws = await connectClient(client);

    const seen: Array<[string, unknown]> = [];
    client.on('StreamStateChanged', (d) => seen.push(['stream', d]));
    client.on('CurrentProgramSceneChanged', (d) => seen.push(['scene', d]));
    const off = client.on('InputMuteStateChanged', (d) =>
      seen.push(['mute', d])
    );

    ws.receive({
      op: 5,
      d: { eventType: 'StreamStateChanged', eventData: { outputActive: true } },
    });
    ws.receive({
      op: 5,
      d: {
        eventType: 'CurrentProgramSceneChanged',
        eventData: { sceneName: 'match' },
      },
    });
    // Event non suivi (hors mapping desktop) : silencieusement ignoré.
    ws.receive({
      op: 5,
      d: { eventType: 'InputCreated', eventData: { inputName: 'x' } },
    });
    await waitFor(() => seen.length >= 2, '2 events dispatchés');

    expect(seen).toEqual([
      ['stream', { outputActive: true }],
      ['scene', { sceneName: 'match' }],
    ]);

    // Désabonnement.
    off();
    ws.receive({
      op: 5,
      d: {
        eventType: 'InputMuteStateChanged',
        eventData: { inputName: 'Mic', inputMuted: true },
      },
    });
    await flush();
    expect(seen).toHaveLength(2);
  });

  it('émet disconnected à la fermeture puis reprogramme une reconnexion (backoff)', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const p0 = client.connect({});
    let ws = MockWs.instances[0];
    ws.receive({ op: 0, d: {} });
    await vi.advanceTimersByTimeAsync(0);
    ws.receive({ op: 2, d: {} });
    await expect(p0).resolves.toEqual({ ok: true });

    let disconnected = 0;
    let reconnected = 0;
    client.on('disconnected', () => disconnected++);
    client.on('connected', () => reconnected++);

    // Coupure serveur → event + reconnexion planifiée à backoff(0) = 1 s.
    ws.serverClose();
    expect(disconnected).toBe(1);
    expect(client.status()).toEqual({ connected: false, reconnecting: true });
    expect(MockWs.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(backoffDelayMs(0));
    expect(MockWs.instances).toHaveLength(2);

    // La reconnexion aboutit → event connected ré-émis (badge UI).
    ws = MockWs.instances[1];
    ws.receive({ op: 0, d: {} });
    await vi.advanceTimersByTimeAsync(0);
    ws.receive({ op: 2, d: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnected).toBe(1);
    expect(client.status().connected).toBe(true);
  });

  it('disconnect() manuel : pas de reconnexion auto', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const p0 = client.connect({});
    const ws = MockWs.instances[0];
    ws.receive({ op: 0, d: {} });
    await vi.advanceTimersByTimeAsync(0);
    ws.receive({ op: 2, d: {} });
    await expect(p0).resolves.toEqual({ ok: true });

    client.disconnect();
    expect(ws.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 2);
    expect(MockWs.instances).toHaveLength(1);
    expect(client.status()).toEqual({ connected: false, reconnecting: false });
  });

  it('émet reconnectFailed UNE fois après MAX_RECONNECT_ATTEMPTS échecs', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const p0 = client.connect({});
    let ws = MockWs.instances[0];
    ws.receive({ op: 0, d: {} });
    await vi.advanceTimersByTimeAsync(0);
    ws.receive({ op: 2, d: {} });
    await expect(p0).resolves.toEqual({ ok: true });

    const failures: unknown[] = [];
    client.on('reconnectFailed', (d) => failures.push(d));

    ws.serverClose();
    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      await vi.advanceTimersByTimeAsync(backoffDelayMs(attempt));
      ws = MockWs.instances[MockWs.instances.length - 1];
      ws.onerror?.();
      await vi.advanceTimersByTimeAsync(0);
    }
    // 20 tentatives épuisées → un seul event, puis plus rien.
    expect(failures).toEqual([{ attempts: MAX_RECONNECT_ATTEMPTS }]);
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 2);
    expect(failures).toHaveLength(1);
    expect(MockWs.instances).toHaveLength(1 + MAX_RECONNECT_ATTEMPTS);
  });
});

// ---------------------------------------------------------------------------
// Setup des scènes overlay (payload pur)
// ---------------------------------------------------------------------------

describe('buildOverlaySceneSetup', () => {
  it('construit les URLs hébergées et marque match/results avec game capture', () => {
    const entries = buildOverlaySceneSetup('https://owwomenscup.fr/', [
      'starting',
      'match',
      'results',
      'webcam',
    ]);
    expect(entries).toEqual([
      {
        type: 'starting',
        sceneName: 'starting',
        url: 'https://owwomenscup.fr/overlay/caster/starting',
        withGame: false,
      },
      {
        type: 'match',
        sceneName: 'match',
        url: 'https://owwomenscup.fr/overlay/caster/match',
        withGame: true,
      },
      {
        type: 'results',
        sceneName: 'results',
        url: 'https://owwomenscup.fr/overlay/caster/results',
        withGame: true,
      },
      {
        type: 'webcam',
        sceneName: 'webcam',
        url: 'https://owwomenscup.fr/overlay/caster/webcam',
        withGame: false,
      },
    ]);
    // Mêmes types gameplay que le desktop (GAMEPLAY_TYPES de tabs/obs.js).
    expect([...OVERLAY_GAMEPLAY_TYPES].sort()).toEqual(['match', 'results']);
  });
});
