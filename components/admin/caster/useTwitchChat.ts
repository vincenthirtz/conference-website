// components/admin/caster/useTwitchChat.ts
//
// Hook du panneau chat Twitch de /admin/caster (lot 4). Il assemble :
//
//  - LECTURE : utils/caster/twitchChatClient — WebSocket IRC direct, connexion
//    ANONYME (aucun token dans le navigateur). La chaîne rejointe vient de
//    GET /api/admin/twitch/connection (broadcaster_login), avec repli sur une
//    saisie manuelle si aucune chaîne n'est connectée.
//  - EVENTS : utils/caster/eventsubClient — socket EventSub navigateur, dont
//    les souscriptions sont créées côté serveur
//    (POST /api/admin/twitch/eventsub/subscribe). Si la route est absente ou
//    refuse (403/404/409), le panneau EventSub passe « indisponible » et le
//    CHAT continue de fonctionner normalement.
//  - ÉCRITURE : POST /api/admin/twitch/chat et
//    /api/admin/twitch/moderation/{ban,clear} — le token broadcaster ne quitte
//    jamais le serveur. Ces routes sont gatées 'admin' : un staff 'caster' peut
//    lire le chat mais reçoit un 403 sur l'envoi/la modération (toast dédié).
//
// Le flux est BUFFERISÉ (flush ~120 ms) : une grosse chaîne peut envoyer des
// dizaines de messages par seconde et un setState par ligne écroulerait la
// page. Les votes MVP, eux, sont notifiés SYNCHRONEMENT via subscribeMessages
// pour ne dépendre d'aucun rendu.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/Toast';
import { AdminFetchError, useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  EventSubClient,
  type EventSubEvent,
  type EventSubPhasePayload,
  type EventSubSubscribeResult,
} from '@/utils/caster/eventsubClient';
import {
  TwitchChatClient,
  normalizeChannel,
  type ChatClearPayload,
} from '@/utils/caster/twitchChatClient';
import type { ChatEvent, ChatMessage } from '@/utils/caster/twitchProtocol';

/** Plafond du flux affiché (les plus anciens tombent). */
export const FEED_MAX = 300;
/** Fenêtre de regroupement des lignes entrantes avant setState. */
const FLUSH_MS = 120;
/** Durée du timeout proposé au survol d'un message (comme le desktop). */
export const TIMEOUT_SECONDS = 600;

export type ChatFeedItem =
  | { id: string; kind: 'message'; message: ChatMessage }
  | { id: string; kind: 'event'; event: ChatEvent | EventSubEvent }
  | { id: string; kind: 'system'; text: string };

export type ChatPhase = 'disconnected' | 'connecting' | 'connected';

export type ChatMessageListener = (msg: ChatMessage) => void;

type TwitchConnection = {
  connected: boolean;
  broadcaster_login?: string;
};

/** Extrait le `code` machine d'une AdminFetchError (payload.code), sinon null. */
function errorCode(err: unknown): string | null {
  if (
    err instanceof AdminFetchError &&
    err.payload &&
    typeof err.payload === 'object'
  ) {
    const c = (err.payload as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

let itemSeq = 0;
function nextId(): string {
  itemSeq += 1;
  return `i${itemSeq}`;
}

export function useTwitchChat() {
  const t = useAdminT('adminCasterScenes');
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();

  // Clients stables pour la vie du composant (initialiseurs lazy : pas d'accès
  // ref pendant le render).
  const [chatClient] = useState(() => new TwitchChatClient());
  const subscribeRef = useRef<
    (sessionId: string) => Promise<EventSubSubscribeResult>
  >(() => Promise.reject(new Error('not ready')));
  const [eventSubClient] = useState(
    () =>
      new EventSubClient({
        subscribe: (sessionId) => subscribeRef.current(sessionId),
      })
  );

  const [phase, setPhase] = useState<ChatPhase>('disconnected');
  const [feed, setFeed] = useState<ChatFeedItem[]>([]);
  const [reconnectFailedAttempts, setReconnectFailedAttempts] = useState<
    number | null
  >(null);
  const [sending, setSending] = useState(false);

  /** Statut de la connexion broadcaster : undefined = chargement. */
  const [connection, setConnection] = useState<TwitchConnection | undefined>(
    undefined
  );
  /** Saisie manuelle de chaîne (repli si aucune chaîne connectée). */
  const [channelInput, setChannelInput] = useState('');
  /** Chaîne réellement rejointe (affichée dans l'en-tête). */
  const [joinedChannel, setJoinedChannel] = useState<string | null>(null);

  const [eventSub, setEventSub] = useState<EventSubPhasePayload>({
    phase: 'idle',
  });

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // --- Flux bufferisé -------------------------------------------------------

  const bufferRef = useRef<ChatFeedItem[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    const batch = bufferRef.current;
    if (batch.length === 0) return;
    bufferRef.current = [];
    setFeed((prev) => {
      const next = prev.concat(batch);
      return next.length > FEED_MAX ? next.slice(next.length - FEED_MAX) : next;
    });
  }, []);

  const push = useCallback(
    (item: ChatFeedItem) => {
      if (!alive.current) return;
      bufferRef.current.push(item);
      if (flushTimerRef.current == null) {
        flushTimerRef.current = setTimeout(flush, FLUSH_MS);
      }
    },
    [flush]
  );

  useEffect(() => {
    return () => {
      if (flushTimerRef.current != null) clearTimeout(flushTimerRef.current);
    };
  }, []);

  const clearFeed = useCallback(() => {
    bufferRef.current = [];
    setFeed([]);
  }, []);

  // --- Abonnés synchrones aux messages (poll MVP) ---------------------------

  const messageListeners = useRef(new Set<ChatMessageListener>());
  const subscribeMessages = useCallback((cb: ChatMessageListener) => {
    messageListeners.current.add(cb);
    return () => {
      messageListeners.current.delete(cb);
    };
  }, []);

  // --- Câblage du client IRC ------------------------------------------------

  // Les libellés système passent par une ref : les listeners sont posés UNE
  // fois (sinon un changement de locale les re-brancherait en pleine session).
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const offs = [
      chatClient.on('connected', ({ channel }) => {
        if (!alive.current) return;
        setPhase('connected');
        setJoinedChannel(channel);
        setReconnectFailedAttempts(null);
        push({
          id: nextId(),
          kind: 'system',
          text: format(tRef.current.chatSystemConnected, { channel }),
        });
      }),
      chatClient.on('disconnected', () => {
        if (!alive.current) return;
        const st = chatClient.status();
        setPhase(st.reconnecting ? 'connecting' : 'disconnected');
        push({
          id: nextId(),
          kind: 'system',
          text: tRef.current.chatSystemDisconnected,
        });
      }),
      chatClient.on('reconnectFailed', ({ attempts }) => {
        if (!alive.current) return;
        setPhase('disconnected');
        setReconnectFailedAttempts(attempts);
      }),
      chatClient.on('message', (msg) => {
        // Notification SYNCHRONE des abonnés (poll MVP) avant tout rendu.
        for (const cb of [...messageListeners.current]) {
          try {
            cb(msg);
          } catch {
            /* un abonné qui jette ne doit pas casser le flux */
          }
        }
        push({ id: nextId(), kind: 'message', message: msg });
      }),
      chatClient.on('event', (evt) => {
        push({ id: nextId(), kind: 'event', event: evt });
      }),
      chatClient.on('clear', (payload: ChatClearPayload) => {
        if (payload.scope === 'all') {
          bufferRef.current = [];
          setFeed([]);
          push({
            id: nextId(),
            kind: 'system',
            text: tRef.current.chatSystemCleared,
          });
          return;
        }
        if (payload.scope === 'user') {
          push({
            id: nextId(),
            kind: 'system',
            text: format(
              payload.duration
                ? tRef.current.chatSystemTimeout
                : tRef.current.chatSystemBanned,
              {
                user: payload.user || '?',
                duration: String(payload.duration ?? ''),
              }
            ),
          });
          return;
        }
        push({
          id: nextId(),
          kind: 'system',
          text: format(tRef.current.chatSystemMessageDeleted, {
            user: payload.user || '?',
          }),
        });
      }),
      chatClient.on('notice', ({ message }) => {
        if (!message) return;
        push({ id: nextId(), kind: 'system', text: message });
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [chatClient, push]);

  // Coupe la socket quand la page se démonte.
  useEffect(() => {
    return () => {
      chatClient.disconnect();
    };
  }, [chatClient]);

  // --- Statut de la connexion broadcaster ----------------------------------

  const loadConnection = useCallback(async () => {
    try {
      const json = await adminFetchJson<TwitchConnection>(
        '/api/admin/twitch/connection'
      );
      if (!alive.current) return json;
      setConnection(json);
      if (json.connected && json.broadcaster_login) {
        setChannelInput((prev) => prev || json.broadcaster_login || '');
      }
      return json;
    } catch {
      // Pas de statut ⇒ on dégrade vers la saisie manuelle, sans bruit.
      if (alive.current) setConnection({ connected: false });
      return { connected: false } as TwitchConnection;
    }
  }, [adminFetchJson]);

  // --- Connexion ------------------------------------------------------------

  const connect = useCallback(
    async (rawChannel?: string) => {
      const target = normalizeChannel(rawChannel ?? channelInput ?? '');
      if (!target) {
        addToast(tRef.current.chatChannelRequired, 'error');
        return;
      }
      setPhase('connecting');
      setReconnectFailedAttempts(null);
      const res = await chatClient.connect(target);
      if (!alive.current) return;
      if ('error' in res) {
        setPhase('disconnected');
        addToast(
          res.error === 'timeout'
            ? tRef.current.chatConnectTimeout
            : tRef.current.chatConnectError,
          'error'
        );
      }
    },
    [addToast, channelInput, chatClient]
  );

  const disconnect = useCallback(() => {
    chatClient.disconnect();
    setPhase('disconnected');
    setJoinedChannel(null);
    setReconnectFailedAttempts(null);
  }, [chatClient]);

  // Auto-connexion au chargement quand une chaîne est déjà connectée côté
  // serveur (même posture que l'app desktop : Twitch connecté ⇒ chat connecté).
  const autoConnectedRef = useRef(false);
  useEffect(() => {
    if (autoConnectedRef.current) return;
    autoConnectedRef.current = true;
    void (async () => {
      const json = await loadConnection();
      if (!alive.current) return;
      if (json.connected && json.broadcaster_login) {
        void connect(json.broadcaster_login);
      }
    })();
    // connect/loadConnection sont stables ; l'effet ne doit tourner qu'une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- EventSub -------------------------------------------------------------

  // Assignée à chaque render (comme tRef) : le client garde une indirection
  // stable et appelle toujours la dernière version de mutateJson.
  subscribeRef.current = (sessionId: string) =>
    mutateJson<EventSubSubscribeResult>(
      '/api/admin/twitch/eventsub/subscribe',
      { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }
    );

  useEffect(() => {
    const offs = [
      eventSubClient.on('phase', (payload) => {
        if (!alive.current) return;
        setEventSub(payload);
      }),
      eventSubClient.on('event', (evt) => {
        push({ id: nextId(), kind: 'event', event: evt });
      }),
    ];
    return () => {
      for (const off of offs) off();
      eventSubClient.stop();
    };
  }, [eventSubClient, push]);

  // EventSub n'a de sens que si une chaîne est connectée côté serveur (c'est
  // elle qui porte le token des souscriptions).
  const twitchConnected = connection?.connected === true;
  useEffect(() => {
    if (twitchConnected) eventSubClient.start();
  }, [twitchConnected, eventSubClient]);

  const retryEventSub = useCallback(() => {
    eventSubClient.stop();
    eventSubClient.start();
  }, [eventSubClient]);

  // --- Écriture (routes serveur) -------------------------------------------

  /** Traduit une erreur d'action en toast (codes du contrat backend). */
  const reportError = useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      if (code === 'NOT_CONNECTED') {
        setConnection({ connected: false });
        addToast(tRef.current.chatErrorNotConnected, 'error');
        return;
      }
      if (code === 'MISSING_SCOPE') {
        addToast(tRef.current.chatErrorMissingScope, 'error');
        return;
      }
      if (err instanceof AdminFetchError && err.status === 403) {
        addToast(tRef.current.chatErrorForbidden, 'error');
        return;
      }
      const msg = err instanceof AdminFetchError ? err.message : null;
      addToast(msg || tRef.current.chatErrorGeneric, 'error');
    },
    [addToast]
  );

  const sendMessage = useCallback(
    async (raw: string): Promise<boolean> => {
      const message = raw.trim();
      if (!message) return false;
      setSending(true);
      try {
        await mutateJson('/api/admin/twitch/chat', {
          method: 'POST',
          body: JSON.stringify({ message }),
        });
        return true;
      } catch (err) {
        reportError(err);
        return false;
      } finally {
        if (alive.current) setSending(false);
      }
    },
    [mutateJson, reportError]
  );

  /** Timeout (durée en secondes) ou ban permanent (duration omis). */
  const moderate = useCallback(
    async (login: string, duration?: number): Promise<boolean> => {
      const target = String(login || '')
        .trim()
        .replace(/^@/, '');
      if (!target) return false;
      const body: { login: string; duration?: number } = { login: target };
      if (typeof duration === 'number') body.duration = duration;
      try {
        await mutateJson('/api/admin/twitch/moderation/ban', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        addToast(
          format(
            typeof duration === 'number'
              ? tRef.current.chatTimeoutSuccess
              : tRef.current.chatBanSuccess,
            { user: target, duration: String(duration ?? '') }
          ),
          'success'
        );
        return true;
      } catch (err) {
        reportError(err);
        return false;
      }
    },
    [addToast, mutateJson, reportError]
  );

  const clearRemoteChat = useCallback(async (): Promise<boolean> => {
    try {
      await mutateJson('/api/admin/twitch/moderation/clear', {
        method: 'POST',
      });
      addToast(tRef.current.chatClearRemoteSuccess, 'success');
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  }, [addToast, mutateJson, reportError]);

  return {
    // état
    phase,
    feed,
    connection,
    channelInput,
    setChannelInput,
    joinedChannel,
    reconnectFailedAttempts,
    sending,
    eventSub,
    // actions
    connect,
    disconnect,
    clearFeed,
    sendMessage,
    moderate,
    clearRemoteChat,
    retryEventSub,
    reloadConnection: loadConnection,
    subscribeMessages,
  };
}

export type UseTwitchChatApi = ReturnType<typeof useTwitchChat>;
