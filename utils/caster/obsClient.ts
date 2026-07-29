// utils/caster/obsClient.ts
//
// Client OBS WebSocket v5 pour le NAVIGATEUR — lot 3 du cockpit caster web.
// Port fidèle du protocole implémenté à la main dans l'app desktop
// (womenscup-caster/src/main/obs.js) : Hello (op 0) → Identify (op 1) →
// Identified (op 2), Request (op 6) / RequestResponse (op 7) corrélés par
// requestId avec timeout, Event (op 5) re-dispatché aux listeners, reconnexion
// auto avec backoff exponentiel (mêmes constantes que le desktop).
//
// Module PUR : zéro React, zéro DOM. Les seules API globales utilisées sont
// WebSocket (injectable pour les tests), WebCrypto (`crypto.subtle`) et `btoa`
// — toutes présentes dans le navigateur ET dans Node ≥ 18 (vitest).
//
// La CSP de /admin/caster autorise ws://localhost:4455 et ws://127.0.0.1:4455
// (proxy.ts, lot 1) : la connexion se fait en direct navigateur → OBS local.

// ---------------------------------------------------------------------------
// Constantes protocolaires — MÊMES valeurs que src/main/obs.js (desktop).
// ---------------------------------------------------------------------------

/** Flags eventSubscriptions envoyés dans Identify (identique au desktop). */
export const OBS_EVENT_SUBSCRIPTIONS = 0x7ff;
/** Timeout d'une requête op 6 sans réponse op 7. */
export const REQUEST_TIMEOUT_MS = 10_000;
/** Timeout du handshake complet (socket ouverte + Hello + Identified). */
export const CONNECT_TIMEOUT_MS = 5_000;
/** Plafond du délai de reconnexion (backoff exponentiel). */
export const MAX_RECONNECT_DELAY_MS = 30_000;
/** Nombre max de tentatives de reconnexion avant abandon (event dédié). */
export const MAX_RECONNECT_ATTEMPTS = 20;

/**
 * Délai avant la tentative de reconnexion n° `attempt` (0-based) — même
 * politique que scheduleObsReconnect côté desktop : 1 s, 2 s, 4 s… cap 30 s.
 */
export function backoffDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

/**
 * Événements OBS (op 5) re-dispatchés aux listeners — liste EXACTE des events
 * que le desktop écoute (mapping handleEvent de obs.js). SwitchScenes (v4) est
 * nommé CurrentProgramSceneChanged en v5.
 */
export const OBS_FORWARDED_EVENTS = [
  'CurrentProgramSceneChanged',
  'StreamStateChanged',
  'RecordStateChanged',
  'SceneListChanged',
  'InputVolumeChanged',
  'InputMuteStateChanged',
] as const;

export type ObsForwardedEvent = (typeof OBS_FORWARDED_EVENTS)[number];

/** Événements de cycle de vie du client (en plus des events OBS ci-dessus). */
export type ObsLifecycleEvent =
  | 'connected'
  | 'disconnected'
  | 'reconnectFailed';

export type ObsClientEvent = ObsForwardedEvent | ObsLifecycleEvent;

export type ObsConnectOptions = {
  host?: string;
  port?: number;
  password?: string;
};

export type ObsConnectResult = { ok: true } | { error: string };

export type ObsClientStatus = {
  connected: boolean;
  /** Une reconnexion auto est planifiée ou en cours. */
  reconnecting: boolean;
};

// ---------------------------------------------------------------------------
// Authentification — sha256(sha256(password + salt) + challenge), base64.
// Équivalent WebCrypto de utils/obsAuth.js (node:crypto) côté desktop.
// ---------------------------------------------------------------------------

async function sha256Base64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  let binary = '';
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Réponse d'authentification OBS WebSocket v5.
 * Spec : base64(sha256(base64(sha256(password + salt)) + challenge)).
 */
export async function computeObsAuth(
  password: string,
  challenge: string,
  salt: string
): Promise<string> {
  const secret = await sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

// ---------------------------------------------------------------------------
// Messages protocole (shapes minimales des op codes utilisés).
// ---------------------------------------------------------------------------

type HelloData = {
  authentication?: { challenge: string; salt: string };
};

type RequestResponseData = {
  requestId: string;
  requestStatus: { result: boolean; comment?: string };
  responseData?: Record<string, unknown>;
};

type EventData = {
  eventType: string;
  eventData?: Record<string, unknown>;
};

export type ObsMessage =
  | { op: 0; d: HelloData }
  | { op: 2; d: Record<string, unknown> }
  | { op: 5; d: EventData }
  | { op: 7; d: RequestResponseData }
  | { op: number; d?: unknown };

/**
 * Construit le message Identify (op 1) en réponse au Hello (op 0). Pur +
 * exporté pour les tests : l'authentification n'est jointe que si le serveur
 * la demande ET qu'un mot de passe est fourni (même logique que le desktop).
 */
export async function buildIdentify(
  helloData: HelloData,
  password?: string
): Promise<{
  op: 1;
  d: {
    rpcVersion: 1;
    eventSubscriptions: number;
    authentication?: string;
  };
}> {
  const identify = {
    op: 1 as const,
    d: {
      rpcVersion: 1 as const,
      eventSubscriptions: OBS_EVENT_SUBSCRIPTIONS,
    } as {
      rpcVersion: 1;
      eventSubscriptions: number;
      authentication?: string;
    },
  };
  if (helloData.authentication && password) {
    identify.d.authentication = await computeObsAuth(
      password,
      helloData.authentication.challenge,
      helloData.authentication.salt
    );
  }
  return identify;
}

// ---------------------------------------------------------------------------
// WebSocket injectable (tests) — sous-ensemble utilisé de l'API standard.
// ---------------------------------------------------------------------------

export type WebSocketLike = {
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
};

export type CreateWebSocket = (url: string) => WebSocketLike;

const defaultCreateWebSocket: CreateWebSocket = (url) =>
  new WebSocket(url) as unknown as WebSocketLike;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

type Pending = {
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Listener = (payload?: unknown) => void;

export class ObsClient {
  private createWs: CreateWebSocket;
  private ws: WebSocketLike | null = null;
  private connected = false;
  private pending = new Map<string, Pending>();
  private requestCounter = 0;
  private listeners = new Map<string, Set<Listener>>();

  private lastOpts: ObsConnectOptions | null = null;
  private userDisconnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectExhausted = false;

  constructor(opts: { createWebSocket?: CreateWebSocket } = {}) {
    this.createWs = opts.createWebSocket || defaultCreateWebSocket;
  }

  // --- Événements -----------------------------------------------------------

  /** Abonne un listener ; renvoie la fonction de désabonnement. */
  on(event: ObsClientEvent, cb: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => {
      set?.delete(cb);
    };
  }

  private emit(event: ObsClientEvent, payload?: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload);
      } catch {
        /* un listener qui jette ne doit pas casser les autres */
      }
    }
  }

  // --- Connexion ------------------------------------------------------------

  status(): ObsClientStatus {
    return {
      connected: this.connected,
      reconnecting:
        !this.connected &&
        !this.userDisconnected &&
        this.lastOpts != null &&
        !this.reconnectExhausted &&
        (this.reconnectTimer != null || this.reconnectAttempts > 0),
    };
  }

  /** Connexion manuelle : mémorise les options pour la reconnexion auto. */
  connect(opts: ObsConnectOptions = {}): Promise<ObsConnectResult> {
    this.userDisconnected = false;
    this.cancelReconnect();
    this.lastOpts = opts;
    return this.open(opts);
  }

  /** Déconnexion manuelle : coupe la socket ET la reconnexion auto. */
  disconnect(): void {
    this.userDisconnected = true;
    this.cancelReconnect();
    this.lastOpts = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* déjà fermée */
      }
      this.ws = null;
    }
    this.connected = false;
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.reconnectExhausted = false;
  }

  /**
   * Reconnexion auto : backoff 1 s → 30 s, 20 tentatives max, puis event
   * `reconnectFailed` émis UNE fois (même politique que le desktop).
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.userDisconnected || !this.lastOpts) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (!this.reconnectExhausted) {
        this.reconnectExhausted = true;
        this.emit('reconnectFailed', { attempts: this.reconnectAttempts });
      }
      return;
    }
    const delay = backoffDelayMs(this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.userDisconnected || !this.lastOpts) return;
      void this.open(this.lastOpts).then((res) => {
        if ('error' in res) this.scheduleReconnect();
      });
    }, delay);
  }

  private open(opts: ObsConnectOptions): Promise<ObsConnectResult> {
    const wsUrl = `ws://${opts.host || 'localhost'}:${opts.port || 4455}`;
    return new Promise((resolve) => {
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          /* déjà fermée */
        }
      }

      let socket: WebSocketLike;
      try {
        socket = this.createWs(wsUrl);
      } catch (err) {
        resolve({
          error: `Impossible de créer la connexion: ${(err as Error).message}`,
        });
        return;
      }
      this.ws = socket;
      let resolved = false;

      const connectTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (this.ws === socket) {
            try {
              socket.close();
            } catch {
              /* déjà fermée */
            }
          }
          resolve({ error: 'timeout' });
        }
      }, CONNECT_TIMEOUT_MS);

      socket.onmessage = (event) => {
        void (async () => {
          try {
            const msg = JSON.parse(String(event.data)) as ObsMessage;

            if (msg.op === 0) {
              const identify = await buildIdentify(
                (msg.d || {}) as HelloData,
                opts.password
              );
              socket.send(JSON.stringify(identify));
            } else if (msg.op === 2) {
              this.connected = true;
              this.reconnectAttempts = 0;
              this.reconnectExhausted = false;
              // Émis aussi sur le chemin reconnexion (badge UI repasse au vert).
              this.emit('connected');
              if (!resolved) {
                resolved = true;
                clearTimeout(connectTimer);
                resolve({ ok: true });
              }
            } else if (msg.op === 5) {
              const d = msg.d as EventData;
              if (
                (OBS_FORWARDED_EVENTS as readonly string[]).includes(
                  d.eventType
                )
              ) {
                this.emit(d.eventType as ObsForwardedEvent, d.eventData);
              }
            } else if (msg.op === 7) {
              const d = msg.d as RequestResponseData;
              const p = this.pending.get(d.requestId);
              if (p) {
                this.pending.delete(d.requestId);
                clearTimeout(p.timer);
                if (d.requestStatus.result) {
                  p.resolve(d.responseData || {});
                } else {
                  p.reject(
                    new Error(d.requestStatus.comment || 'Request failed')
                  );
                }
              }
            }
          } catch {
            /* message illisible : ignoré, comme sur desktop */
          }
        })();
      };

      socket.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(connectTimer);
          resolve({ error: 'socket' });
        }
      };

      socket.onclose = () => {
        if (this.ws === socket) {
          this.connected = false;
          this.ws = null;
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error('Connexion OBS fermée'));
          }
          this.pending.clear();
          this.emit('disconnected');
          this.scheduleReconnect();
        }
      };
    });
  }

  // --- Requêtes -------------------------------------------------------------

  /**
   * Envoie une Request (op 6) et résout avec le responseData de la
   * RequestResponse (op 7) corrélée par requestId. Rejette si OBS répond
   * result=false (comment en message) ou sans réponse sous 10 s.
   */
  call(
    requestType: string,
    requestData?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        reject(new Error('Non connecté à OBS'));
        return;
      }
      const requestId = `req_${++this.requestCounter}_${Date.now()}`;
      const timer = setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error('Timeout'));
        }
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });

      const msg: {
        op: 6;
        d: {
          requestType: string;
          requestId: string;
          requestData?: Record<string, unknown>;
        };
      } = { op: 6, d: { requestType, requestId } };
      if (requestData) msg.d.requestData = requestData;

      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        this.pending.delete(requestId);
        clearTimeout(timer);
        reject(err as Error);
      }
    });
  }
}
