// features/player/library/ui/chat/useLibraryChat.ts — le chat d'une salle de
// la Women's Library, pour l'écran (lot 6 de docs/PLAN-womens-library.md) :
//
//   1. le FIL d'arrivée et l'état du chat pour moi (`GET rooms/:id/messages`) ;
//   2. les événements du canal SERVEUR, relayés par la connexion de la scène
//      (`realtime/chatBus.ts`) : messages, masquages, MA sourdine, et le
//      contexte (moi, personnes masquées — bloquer masque aussi les
//      messages) ;
//   3. les gestes, TOUS par l'API : écrire, masquer, mettre en sourdine,
//      signaler. Chaque geste rend une issue (`{ ok, data }` ou
//      `{ ok: false, error }`) ; un double clic rend `null` au second.
//
// Le fil se garde dans un réducteur PUR (`realtime/chatState.ts`).

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  LibraryChatHideResponse,
  LibraryChatMuteResponse,
  LibraryChatReportResponse,
  LibraryChatSendResponse,
  LibraryChatState,
} from '../../chat/responses';
import type { LibraryChatReportInput } from '../../chat/schemas';
import { subscribeLibraryChat } from '../../realtime/chatBus';
import {
  libraryChatClient,
  type LibraryChatClient,
} from '../../realtime/chatClient';
import {
  chatFeedReducer,
  initialChatFeed,
  isMutedAt,
} from '../../realtime/chatState';
import { type ChatError, chatErrorOf } from './chatModel';

export type ChatResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ChatError };

export type UseLibraryChatOptions = {
  roomId: string;
  /** Le client HTTP (tests, page de développement) ; défaut : l'API. */
  client?: LibraryChatClient;
};

/** Un verrou par geste : le second appel concurrent rend `null`. */
function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(async <T>(run: () => Promise<T>): Promise<T | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      return await run();
    } finally {
      busy.current = false;
    }
  }, []);
}

async function settle<T>(run: () => Promise<T>): Promise<ChatResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (err) {
    return { ok: false, error: chatErrorOf(err) };
  }
}

export function useLibraryChat({ roomId, client }: UseLibraryChatOptions) {
  const apiRef = useRef(client ?? libraryChatClient);
  apiRef.current = client ?? libraryChatClient;

  const [feed, dispatch] = useReducer(chatFeedReducer, undefined, () =>
    initialChatFeed()
  );
  const [chat, setChat] = useState<LibraryChatState | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);

  // Le relais de la salle : messages, masquages, sourdine, contexte.
  useEffect(
    () =>
      subscribeLibraryChat(roomId, (event) => {
        switch (event.type) {
          case 'context':
            setSelfId(event.context.selfId);
            dispatch({
              type: 'hiddenUsers',
              userIds: event.context.hiddenUserIds,
            });
            return;
          case 'message':
            dispatch({ type: 'message', message: event.message });
            return;
          case 'hidden':
            dispatch({ type: 'hidden', id: event.id });
            return;
          case 'muted':
            dispatch({ type: 'muted', until: event.until });
            return;
          case 'unmuted':
            dispatch({ type: 'unmuted' });
            return;
        }
      }),
    [roomId]
  );

  // Le fil d'arrivée (après l'abonnement : rien ne passe entre les deux).
  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    apiRef.current
      .list(roomId)
      .then((res) => {
        if (cancelled) return;
        setChat(res.chat);
        dispatch({
          type: 'history',
          messages: res.messages,
          mutedUntil: res.chat.mutedUntil,
        });
        setPhase('ready');
      })
      .catch(() => {
        if (!cancelled) setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, attempt]);

  // La sourdine prend fin d'elle-même : un rendu à l'échéance.
  useEffect(() => {
    if (!feed.mutedUntil) return undefined;
    const ms = Date.parse(feed.mutedUntil) - Date.now();
    if (!(ms > 0)) return undefined;
    const id = setTimeout(
      () => setTick((n) => n + 1),
      Math.min(ms + 50, 2_147_000_000)
    );
    return () => clearTimeout(id);
  }, [feed.mutedUntil]);

  const muted = isMutedAt(feed.mutedUntil, Date.now());
  const enabled = chat?.enabled === true;
  // `canWrite` faux SANS sourdine : au QG, le staff non membre lit seulement.
  const readOnly = enabled && chat?.canWrite === false && !chat.mutedUntil;
  const writable = enabled && !readOnly && !muted;

  /* ------------------------------------------------------------ gestes --- */

  const sendFlight = useSingleFlight();
  const [sending, setSending] = useState(false);
  const send = useCallback(
    (text: string) =>
      sendFlight(async (): Promise<ChatResult<LibraryChatSendResponse>> => {
        setSending(true);
        const result = await settle(() => apiRef.current.send(roomId, text));
        setSending(false);
        if (result.ok) {
          dispatch({ type: 'message', message: result.data.message });
        } else if (result.error.key === 'chat_muted' && result.error.until) {
          dispatch({ type: 'muted', until: result.error.until });
        } else if (result.error.key === 'chat_disabled') {
          setChat((c) => (c ? { ...c, enabled: false, canWrite: false } : c));
        }
        return result;
      }),
    [roomId, sendFlight]
  );

  const hideFlight = useSingleFlight();
  const hide = useCallback(
    (messageId: string) =>
      hideFlight(async (): Promise<ChatResult<LibraryChatHideResponse>> => {
        const result = await settle(() =>
          apiRef.current.hide(roomId, messageId)
        );
        if (result.ok) dispatch({ type: 'hidden', id: messageId });
        return result;
      }),
    [roomId, hideFlight]
  );

  const muteFlight = useSingleFlight();
  const mute = useCallback(
    (userId: string, minutes: number) =>
      muteFlight(
        (): Promise<ChatResult<LibraryChatMuteResponse>> =>
          settle(() => apiRef.current.mute(roomId, { userId, minutes }))
      ),
    [roomId, muteFlight]
  );

  const reportFlight = useSingleFlight();
  const report = useCallback(
    (messageId: string, input: LibraryChatReportInput) =>
      reportFlight(
        (): Promise<ChatResult<LibraryChatReportResponse>> =>
          settle(() => apiRef.current.report(roomId, messageId, input))
      ),
    [roomId, reportFlight]
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    phase,
    chat,
    feed,
    selfId,
    enabled,
    readOnly,
    muted,
    mutedUntil: muted ? feed.mutedUntil : null,
    writable,
    sending,
    send,
    hide,
    mute,
    report,
    retry,
  };
}

export type LibraryChatController = ReturnType<typeof useLibraryChat>;
