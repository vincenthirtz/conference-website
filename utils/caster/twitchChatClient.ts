// utils/caster/twitchChatClient.ts
//
// Client IRC Twitch pour le NAVIGATEUR — lot 4 du cockpit caster web. Port du
// transport de womenscup-caster/src/main/twitch-chat.js, avec UNE différence
// structurante de sécurité :
//
//   ⚠️ La connexion est ANONYME (PASS SCHMOOPIIE / NICK justinfanN). Aucun
//   token Twitch ne transite par le navigateur. On ne peut donc que LIRE le
//   chat ici ; l'envoi de messages et la modération passent par les routes
//   serveur (/api/admin/twitch/chat, /api/admin/twitch/moderation/*) où le
//   token du broadcaster reste côté serveur.
//
// Module PUR : zéro React, zéro DOM. Le parsing/projection vit déjà dans
// utils/caster/twitchProtocol (partagé avec le desktop) ; ici on ne gère que le
// transport (handshake, PING/PONG, dispatch, reconnexion backoff).
//
// Le WebSocket est injectable (`createWebSocket`) pour les tests unitaires —
// même posture que utils/caster/obsClient.
//
// CSP : wss://irc-ws.chat.twitch.tv est autorisé sur /admin/caster (proxy.ts).

import {
  anonymousNick,
  buildCheerEvent,
  buildUsernoticeEvent,
  formatChatMessage,
  parseTwitchMessage,
  type ChatEvent,
  type ChatMessage,
} from './twitchProtocol';

// ---------------------------------------------------------------------------
// Constantes — MÊMES valeurs que src/main/twitch-chat.js (desktop).
// ---------------------------------------------------------------------------

export const IRC_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';

/** Mot de passe conventionnel de la connexion anonyme en lecture seule. */
export const ANONYMOUS_PASS = 'SCHMOOPIIE';

/**
 * Capacités IRCv3 demandées. `twitch.tv/membership` (JOIN/PART des viewers)
 * est volontairement OMIS : le cockpit n'affiche pas de liste de présents et
 * cette capacité génère un flot de lignes inutile sur une grosse chaîne.
 */
export const CAP_REQ = 'CAP REQ :twitch.tv/tags twitch.tv/commands';

/** Handshake sans 001/376 au-delà de ce délai ⇒ échec de connexion. */
export const CONNECT_TIMEOUT_MS = 10_000;
/** Plafond du délai de reconnexion (backoff exponentiel). */
export const MAX_RECONNECT_DELAY_MS = 30_000;
/** Tentatives de reconnexion avant abandon (event `reconnectFailed`). */
export const MAX_RECONNECT_ATTEMPTS = 12;

/** Délai avant la tentative n° `attempt` (0-based) : 1 s, 2 s, 4 s… cap 30 s. */
export function backoffDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

/**
 * Normalise une saisie de chaîne en login IRC : accepte `Womens_Cup`,
 * `#womens_cup`, `@womens_cup`, `twitch.tv/womens_cup`,
 * `https://www.twitch.tv/womens_cup?x=1`. Rend '' si rien d'exploitable.
 */
export function normalizeChannel(raw: string): string {
  let value = String(raw || '').trim();
  if (!value) return '';
  // URL complète ou partielle → dernier segment de chemin.
  const urlMatch = value.match(
    /(?:^|\/\/)(?:[\w.-]*\.)?twitch\.tv\/([^/?#]+)/i
  );
  if (urlMatch) value = urlMatch[1];
  value = value.replace(/^[#@]+/, '').split(/[/?#]/)[0];
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

// ---------------------------------------------------------------------------
// Payloads dispatchés
// ---------------------------------------------------------------------------

/**
 * CLEARCHAT (chat vidé / user banni ou timeout) et CLEARMSG (message unique
 * supprimé) sont projetés dans un seul payload — l'UI n'en fait qu'une ligne
 * système, comme le desktop.
 */
export type ChatClearPayload = {
  /** 'all' = chat vidé, 'user' = ban/timeout, 'message' = message supprimé. */
  scope: 'all' | 'user' | 'message';
  /** Login concerné (null pour un chat vidé). */
  user: string | null;
  /** Durée du timeout en secondes (null = ban permanent ou N/A). */
  duration: number | null;
  /** id du message supprimé (CLEARMSG). */
  targetMsgId: string | null;
  /** Texte du message supprimé (CLEARMSG). */
  message: string | null;
};

export type ChatNoticePayload = { message: string; msgId: string };

export type ChatClientEventMap = {
  message: ChatMessage;
  event: ChatEvent;
  clear: ChatClearPayload;
  notice: ChatNoticePayload;
  connected: { channel: string };
  disconnected: { channel: string | null };
  reconnectFailed: { attempts: number };
};

export type ChatClientEventName = keyof ChatClientEventMap;

export type ChatConnectResult =
  | { ok: true; channel: string }
  | { error: string };

export type ChatClientStatus = {
  connected: boolean;
  channel: string | null;
  /** Une reconnexion auto est planifiée ou en cours. */
  reconnecting: boolean;
};

// ---------------------------------------------------------------------------
// WebSocket injectable (tests) — même contrat que obsClient.
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

export type TwitchChatClientOptions = {
  createWebSocket?: CreateWebSocket;
  /** Générateur du nick anonyme (injectable pour des tests déterministes). */
  makeNick?: () => string;
  url?: string;
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

type Listener = (payload: never) => void;

export class TwitchChatClient {
  private createWs: CreateWebSocket;
  private makeNick: () => string;
  private url: string;

  private ws: WebSocketLike | null = null;
  private connected = false;
  private channel: string | null = null;
  private listeners = new Map<string, Set<Listener>>();

  private userDisconnected = true;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectExhausted = false;

  constructor(opts: TwitchChatClientOptions = {}) {
    this.createWs = opts.createWebSocket || defaultCreateWebSocket;
    this.makeNick = opts.makeNick || (() => anonymousNick());
    this.url = opts.url || IRC_WS_URL;
  }

  // --- Événements -----------------------------------------------------------

  /** Abonne un listener ; renvoie la fonction de désabonnement. */
  on<K extends ChatClientEventName>(
    event: K,
    cb: (payload: ChatClientEventMap[K]) => void
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

  private emit<K extends ChatClientEventName>(
    event: K,
    payload: ChatClientEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        (cb as unknown as (p: ChatClientEventMap[K]) => void)(payload);
      } catch {
        /* un listener qui jette ne doit pas casser les autres */
      }
    }
  }

  // --- Connexion ------------------------------------------------------------

  status(): ChatClientStatus {
    return {
      connected: this.connected,
      channel: this.channel,
      reconnecting:
        !this.connected &&
        !this.userDisconnected &&
        this.channel != null &&
        !this.reconnectExhausted &&
        (this.reconnectTimer != null || this.reconnectAttempts > 0),
    };
  }

  /** Connexion manuelle : mémorise la chaîne pour la reconnexion auto. */
  connect(rawChannel: string): Promise<ChatConnectResult> {
    const channel = normalizeChannel(rawChannel);
    if (!channel) {
      return Promise.resolve({ error: 'invalid-channel' });
    }
    this.userDisconnected = false;
    this.cancelReconnect();
    this.channel = channel;
    return this.open(channel);
  }

  /** Déconnexion manuelle : coupe la socket ET la reconnexion auto. */
  disconnect(): void {
    this.userDisconnected = true;
    this.cancelReconnect();
    const channel = this.channel;
    this.channel = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* déjà fermée */
      }
      this.ws = null;
    }
    if (this.connected) {
      this.connected = false;
      this.emit('disconnected', { channel });
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
   * Reconnexion auto : backoff 1 s → 30 s, 12 tentatives max, puis event
   * `reconnectFailed` émis UNE fois (même politique que le desktop).
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.userDisconnected || !this.channel) return;
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
      const channel = this.channel;
      if (this.userDisconnected || !channel) return;
      void this.open(channel).then((res) => {
        // Un échec replanifie ; un succès remet le compteur à zéro dans la
        // branche 001/376 de handleLine.
        if ('error' in res) this.scheduleReconnect();
      });
    }, delay);
  }

  private open(channel: string): Promise<ChatConnectResult> {
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
        socket = this.createWs(this.url);
      } catch (err) {
        resolve({ error: (err as Error)?.message || 'socket' });
        return;
      }
      this.ws = socket;
      let resolved = false;

      const connectTimer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        if (this.ws === socket) {
          try {
            socket.close();
          } catch {
            /* déjà fermée */
          }
        }
        resolve({ error: 'timeout' });
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        // Ordre imposé par Twitch : CAP puis PASS puis NICK, enfin JOIN.
        socket.send(CAP_REQ);
        socket.send(`PASS ${ANONYMOUS_PASS}`);
        socket.send(`NICK ${this.makeNick()}`);
        socket.send(`JOIN #${channel}`);
      };

      socket.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : '';
        for (const line of raw.split('\r\n')) {
          if (!line) continue;
          this.handleLine(socket, channel, line, () => {
            if (resolved) return;
            resolved = true;
            clearTimeout(connectTimer);
            resolve({ ok: true, channel });
          });
        }
      };

      socket.onerror = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(connectTimer);
        resolve({ error: 'socket' });
      };

      socket.onclose = () => {
        // Ignore les callbacks d'une socket déjà remplacée.
        if (this.ws !== socket) return;
        clearTimeout(connectTimer);
        const wasConnected = this.connected;
        this.connected = false;
        this.ws = null;
        if (wasConnected) this.emit('disconnected', { channel });
        this.scheduleReconnect();
      };
    });
  }

  /** Traite UNE ligne IRC. `onWelcome` résout la promesse de connexion. */
  private handleLine(
    socket: WebSocketLike,
    channel: string,
    line: string,
    onWelcome: () => void
  ): void {
    if (line.startsWith('PING')) {
      socket.send('PONG :tmi.twitch.tv');
      return;
    }

    const parsed = parseTwitchMessage(line);

    switch (parsed.command) {
      case '001':
      case '376':
        if (!this.connected) {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.reconnectExhausted = false;
          this.emit('connected', { channel });
        }
        onWelcome();
        break;

      case 'PRIVMSG': {
        this.emit('message', formatChatMessage(parsed));
        // Un cheer voyage sur un PRIVMSG normal (tag bits) : on le remonte
        // AUSSI en carte d'event pour ne pas perdre les bits dans le flux.
        const cheer = buildCheerEvent(parsed);
        if (cheer) this.emit('event', cheer);
        break;
      }

      case 'USERNOTICE':
        // sub / resub / subgift / submysterygift / raid / … → carte d'event.
        this.emit('event', buildUsernoticeEvent(parsed));
        break;

      case 'CLEARCHAT': {
        const user = parsed.params[1] || null;
        const rawDuration = parsed.tags['ban-duration'];
        this.emit('clear', {
          scope: user ? 'user' : 'all',
          user,
          duration: rawDuration ? parseInt(rawDuration, 10) || null : null,
          targetMsgId: null,
          message: null,
        });
        break;
      }

      case 'CLEARMSG':
        this.emit('clear', {
          scope: 'message',
          user: parsed.tags.login || null,
          duration: null,
          targetMsgId: parsed.tags['target-msg-id'] || null,
          message: parsed.params[1] || null,
        });
        break;

      case 'NOTICE':
        this.emit('notice', {
          message: parsed.params[1] || '',
          msgId: parsed.tags['msg-id'] || '',
        });
        break;

      case 'RECONNECT':
        // Twitch demande une reconnexion (maintenance serveur) : on ferme, le
        // handler onclose replanifie avec le backoff habituel.
        try {
          socket.close();
        } catch {
          /* déjà fermée */
        }
        break;

      default:
        break;
    }
  }
}
