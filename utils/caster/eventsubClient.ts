// utils/caster/eventsubClient.ts
//
// Client Twitch EventSub (WebSocket) pour le NAVIGATEUR — lot 4 du cockpit
// caster web. Port de womenscup-caster/src/main/eventsub.js +
// utils/eventsubEvents.js, avec la même différence de sécurité que le chat :
//
//   ⚠️ La création des souscriptions Helix exige un token broadcaster — elle
//   est donc DÉLÉGUÉE au serveur (POST /api/admin/twitch/eventsub/subscribe,
//   body { session_id }). Le navigateur n'ouvre que la socket EventSub (qui,
//   elle, ne demande aucune authentification) et pousse le session_id.
//
// EventSub ne sert qu'à ce que l'IRC ne livre pas : les FOLLOWS
// (channel.follow v2) et les SHOUTOUTS REÇUS (channel.shoutout.receive v1).
// Subs/resubs/gifts/raids/bits arrivent déjà par le chat (twitchProtocol).
//
// Module PUR : zéro React, zéro DOM ; WebSocket + fonction de souscription
// injectables pour les tests.
//
// CSP : wss://eventsub.wss.twitch.tv est autorisé sur /admin/caster (proxy.ts).

import type { CreateWebSocket, WebSocketLike } from './twitchChatClient';

export const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

/** Souscriptions créées à chaque nouvelle session (mêmes que le desktop). */
export const EVENTSUB_SUBSCRIPTIONS = [
  { type: 'channel.follow', version: '2' },
  { type: 'channel.shoutout.receive', version: '1' },
] as const;

export const MAX_RECONNECT_DELAY_MS = 30_000;
export const MAX_RECONNECT_ATTEMPTS = 12;
/** Marge ajoutée au keepalive_timeout annoncé avant de considérer la socket morte. */
export const KEEPALIVE_GRACE_MS = 10_000;

export function backoffDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

/**
 * Event normalisé produit par EventSub — même shape de carte que les events
 * IRC (twitchProtocol.ChatEvent), avec deux `kind` supplémentaires que l'IRC
 * ne connaît pas. Volontairement structurel (pas d'extends) : twitchProtocol
 * est partagé mot pour mot avec le desktop et n'est pas modifié ici.
 */
export type EventSubEvent = {
  kind: 'follow' | 'shoutout';
  msgId: string;
  displayName: string;
  message: string;
  systemMsg: string;
  viewers?: number;
};

/**
 * Projette une notification EventSub dans la shape de carte du chat, ou null
 * pour les types qu'on n'affiche pas. Port fidèle de
 * womenscup-caster/src/main/utils/eventsubEvents.js.
 */
export function mapEventSubNotification(
  subType: string | undefined,
  event: unknown
): EventSubEvent | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as Record<string, unknown>;
  switch (subType) {
    case 'channel.follow':
      return {
        kind: 'follow',
        msgId: 'follow',
        displayName: String(e.user_name || e.user_login || ''),
        message: '',
        systemMsg: '',
      };
    case 'channel.shoutout.receive':
      return {
        kind: 'shoutout',
        msgId: 'shoutout',
        displayName: String(
          e.from_broadcaster_user_name || e.from_broadcaster_user_login || ''
        ),
        viewers: Number(e.viewer_count) || 0,
        message: '',
        systemMsg: '',
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Contrat de la route serveur (implémentée par l'agent api).
// ---------------------------------------------------------------------------

export type EventSubSubscribeResult = {
  created: string[];
  failed: { type: string; status: number; message: string }[];
};

/**
 * POST du session_id vers la route serveur. DOIT rejeter avec un objet portant
 * un `status` numérique pour les erreurs HTTP (AdminFetchError le fait).
 */
export type SubscribeFn = (
  sessionId: string
) => Promise<EventSubSubscribeResult>;

/**
 * Phases du client :
 *  - idle          : arrêté ;
 *  - connecting    : socket en cours d'ouverture / reconnexion ;
 *  - subscribing   : session_welcome reçu, souscriptions en cours côté serveur ;
 *  - ready         : au moins une souscription active, on reçoit les events ;
 *  - unavailable   : la fonctionnalité n'est pas disponible (route absente,
 *                    chaîne non connectée, scope manquant, tout a échoué) — le
 *                    client s'arrête, le CHAT continue de fonctionner ;
 *  - error         : problème transport, reconnexion en cours ou abandonnée.
 */
export type EventSubPhase =
  | 'idle'
  | 'connecting'
  | 'subscribing'
  | 'ready'
  | 'unavailable'
  | 'error';

export type EventSubPhasePayload = {
  phase: EventSubPhase;
  /** Détail machine : 'not-connected' | 'missing-scope' | 'not-implemented' | … */
  reason?: string;
  /** Message lisible (première erreur remontée par le serveur). */
  detail?: string;
};

export type EventSubClientEventMap = {
  event: EventSubEvent;
  phase: EventSubPhasePayload;
  revocation: { type: string };
};

export type EventSubClientEventName = keyof EventSubClientEventMap;

export type EventSubClientOptions = {
  subscribe: SubscribeFn;
  createWebSocket?: CreateWebSocket;
  url?: string;
};

const defaultCreateWebSocket: CreateWebSocket = (url) =>
  new WebSocket(url) as unknown as WebSocketLike;

type Listener = (payload: never) => void;

/** Statuts HTTP qui signifient « inutile de réessayer tout seul ». */
const FATAL_SUBSCRIBE_STATUS = new Set([401, 403, 404, 405, 409, 501]);

function statusReason(status: number): string {
  if (status === 409) return 'not-connected';
  if (status === 403) return 'missing-scope';
  if (status === 404 || status === 405 || status === 501)
    return 'not-implemented';
  return 'subscribe-failed';
}

export class EventSubClient {
  private subscribe: SubscribeFn;
  private createWs: CreateWebSocket;
  private url: string;

  private ws: WebSocketLike | null = null;
  private running = false;
  private sessionId: string | null = null;
  private listeners = new Map<string, Set<Listener>>();

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveMs = 0;

  constructor(opts: EventSubClientOptions) {
    this.subscribe = opts.subscribe;
    this.createWs = opts.createWebSocket || defaultCreateWebSocket;
    this.url = opts.url || EVENTSUB_WS_URL;
  }

  on<K extends EventSubClientEventName>(
    event: K,
    cb: (payload: EventSubClientEventMap[K]) => void
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const listener = cb as unknown as Listener;
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  private emit<K extends EventSubClientEventName>(
    event: K,
    payload: EventSubClientEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        (cb as unknown as (p: EventSubClientEventMap[K]) => void)(payload);
      } catch {
        /* un listener qui jette ne doit pas casser les autres */
      }
    }
  }

  /** Démarre le client (idempotent). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.reconnectAttempts = 0;
    this.emit('phase', { phase: 'connecting' });
    this.open(this.url, true);
  }

  /** Arrête le client et oublie la session. */
  stop(): void {
    this.running = false;
    this.clearTimers();
    this.sessionId = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* déjà fermée */
      }
      this.ws = null;
    }
    this.emit('phase', { phase: 'idle' });
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /** Arrêt définitif suite à une erreur non réessayable côté serveur. */
  private giveUp(reason: string, detail?: string): void {
    this.running = false;
    this.clearTimers();
    this.sessionId = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* déjà fermée */
      }
      this.ws = null;
    }
    this.emit('phase', { phase: 'unavailable', reason, detail });
  }

  /**
   * Watchdog keepalive : Twitch annonce `keepalive_timeout_seconds` dans le
   * welcome et envoie un frame au moins aussi souvent. Sans frame passé ce
   * délai (+ marge), la socket est morte sans close() — on force la reconnexion.
   * (Ajout vs desktop, qui s'en remet uniquement au close.)
   */
  private armKeepalive(socket: WebSocketLike): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    if (!this.keepaliveMs) return;
    this.keepaliveTimer = setTimeout(() => {
      this.keepaliveTimer = null;
      if (this.ws !== socket) return;
      try {
        socket.close();
      } catch {
        /* déjà fermée */
      }
    }, this.keepaliveMs);
  }

  private open(wsUrl: string, subscribeOnWelcome: boolean): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* remplacement d'une socket morte */
      }
    }

    let socket: WebSocketLike;
    try {
      socket = this.createWs(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onmessage = (e) => {
      let frame: {
        metadata?: { message_type?: string; subscription_type?: string };
        payload?: {
          session?: {
            id?: string;
            reconnect_url?: string;
            keepalive_timeout_seconds?: number;
          };
          event?: unknown;
          subscription?: { type?: string };
        };
      };
      try {
        frame = JSON.parse(typeof e.data === 'string' ? e.data : '');
      } catch {
        return;
      }
      this.armKeepalive(socket);
      const type = frame?.metadata?.message_type;

      if (type === 'session_welcome') {
        this.sessionId = frame.payload?.session?.id || null;
        this.reconnectAttempts = 0;
        const keepalive = Number(
          frame.payload?.session?.keepalive_timeout_seconds
        );
        this.keepaliveMs =
          keepalive > 0 ? keepalive * 1000 + KEEPALIVE_GRACE_MS : 0;
        this.armKeepalive(socket);
        // Sur un reconnect gracieux, les souscriptions existantes suivent la
        // nouvelle session : on ne re-souscrit QUE sur une connexion fraîche.
        if (subscribeOnWelcome && this.sessionId) {
          void this.subscribeAll(this.sessionId);
        } else if (this.sessionId) {
          this.emit('phase', { phase: 'ready' });
        }
      } else if (type === 'session_reconnect') {
        const newUrl = frame.payload?.session?.reconnect_url;
        if (newUrl) this.open(newUrl, false);
      } else if (type === 'notification') {
        const evt = mapEventSubNotification(
          frame.metadata?.subscription_type,
          frame.payload?.event
        );
        if (evt) this.emit('event', evt);
      } else if (type === 'revocation') {
        this.emit('revocation', {
          type: frame.payload?.subscription?.type || '',
        });
      }
      // session_keepalive : heartbeat, rien à faire (le watchdog est réarmé).
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      if (this.running) {
        this.emit('phase', { phase: 'error', reason: 'socket-closed' });
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      /* un close suit ; la reconnexion est gérée là-bas */
    };
  }

  private async subscribeAll(sessionId: string): Promise<void> {
    this.emit('phase', { phase: 'subscribing' });
    let result: EventSubSubscribeResult;
    try {
      result = await this.subscribe(sessionId);
    } catch (err) {
      const status = Number((err as { status?: unknown })?.status) || 0;
      const detail = (err as { message?: string })?.message;
      // 403/404/409… : rien à réessayer côté navigateur — on rend le panneau
      // « indisponible » et on coupe. Le chat, lui, continue.
      if (!status || FATAL_SUBSCRIBE_STATUS.has(status)) {
        this.giveUp(status ? statusReason(status) : 'subscribe-failed', detail);
        return;
      }
      this.emit('phase', {
        phase: 'error',
        reason: 'subscribe-failed',
        detail,
      });
      return;
    }

    // La session est vivante mais aucune souscription n'a pu être créée :
    // inutile de laisser la socket ouverte, on affiche l'indisponibilité.
    if (!result || result.created.length === 0) {
      const first = result?.failed?.[0];
      this.giveUp(
        first ? statusReason(first.status) : 'subscribe-failed',
        first?.message
      );
      return;
    }
    this.emit('phase', {
      phase: 'ready',
      detail: result.failed?.[0]?.message,
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.running) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.giveUp('reconnect-exhausted');
      return;
    }
    const delay = backoffDelayMs(this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.running) return;
      this.emit('phase', { phase: 'connecting' });
      this.open(this.url, true);
    }, delay);
  }
}
