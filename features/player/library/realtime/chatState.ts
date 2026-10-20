// features/player/library/realtime/chatState.ts — le FIL du chat d'une salle
// de la Women's Library, côté joueuse (lot 6 de docs/PLAN-womens-library.md).
// Réducteur PUR : aucune horloge, aucun réseau, testé seul. Il reçoit le fil
// lu à l'arrivée (`GET rooms/:id/messages`), puis les événements du canal
// SERVEUR de la salle, déjà validés (`./chatEvents.ts`).
//
// LES RÈGLES :
//   - un message n'apparaît qu'une fois (par `id`), dans l'ordre d'envoi ;
//   - jamais un message d'une personne masquée (blocages, dans les deux
//     sens) : bloquer masque aussi ses messages, y compris ceux déjà affichés ;
//   - un message masqué par la modération perd son texte AUSSITÔT (seule une
//     mention « masqué » reste), et un message masqué qui arriverait en
//     retard n'est pas montré ;
//   - au plus `CHAT_FEED_MAX` messages : les plus anciens sortent.

import type { LibraryChatMessage } from '../chat/responses';

/** Messages gardés en mémoire (le fil en lit 50 à l'arrivée). */
export const CHAT_FEED_MAX = 100;

/** Un message du fil ; `hidden` : masqué par la modération, texte effacé. */
export type ChatFeedMessage = LibraryChatMessage & { hidden?: true };

export type ChatFeedState = {
  messages: ChatFeedMessage[];
  /** Masqués par la modération (pour ne pas montrer une arrivée tardive). */
  hiddenIds: string[];
  /** Personnes masquées (blocages, deux sens confondus), triées. */
  hiddenUsers: string[];
  /** Fin de MA sourdine (ici ou partout), si on la connaît. */
  mutedUntil: string | null;
  /** Le fil d'arrivée a été lu. */
  loaded: boolean;
};

export type ChatFeedAction =
  | {
      type: 'history';
      messages: LibraryChatMessage[];
      mutedUntil?: string | null;
    }
  | { type: 'message'; message: LibraryChatMessage }
  | { type: 'hidden'; id: string }
  | { type: 'hiddenUsers'; userIds: readonly string[] }
  | { type: 'muted'; until: string }
  | { type: 'unmuted' }
  | { type: 'reset' };

export function initialChatFeed(
  hiddenUsers: readonly string[] = []
): ChatFeedState {
  return {
    messages: [],
    hiddenIds: [],
    hiddenUsers: [...new Set(hiddenUsers)].sort(),
    mutedUntil: null,
    loaded: false,
  };
}

function byTime(a: ChatFeedMessage, b: ChatFeedMessage): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (ta !== tb && Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Fusionne, sans doublon, en ordre d'envoi, sans personnes masquées. */
function merge(
  state: ChatFeedState,
  incoming: readonly LibraryChatMessage[]
): ChatFeedMessage[] {
  const blocked = new Set(state.hiddenUsers);
  const masked = new Set(state.hiddenIds);
  const byId = new Map<string, ChatFeedMessage>();
  for (const m of state.messages) byId.set(m.id, m);
  for (const m of incoming) {
    if (blocked.has(m.userId) || byId.has(m.id)) continue;
    byId.set(m.id, masked.has(m.id) ? { ...m, body: '', hidden: true } : m);
  }
  const all = [...byId.values()].sort(byTime);
  return all.length > CHAT_FEED_MAX
    ? all.slice(all.length - CHAT_FEED_MAX)
    : all;
}

/** La plus lointaine de deux échéances ISO (`null` = aucune). */
function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

export function chatFeedReducer(
  state: ChatFeedState,
  action: ChatFeedAction
): ChatFeedState {
  switch (action.type) {
    case 'history':
      return {
        ...state,
        messages: merge(state, action.messages),
        mutedUntil:
          action.mutedUntil === undefined
            ? state.mutedUntil
            : later(state.mutedUntil, action.mutedUntil),
        loaded: true,
      };

    case 'message': {
      const messages = merge(state, [action.message]);
      return messages.length === state.messages.length &&
        messages.every((m, i) => m === state.messages[i])
        ? state
        : { ...state, messages };
    }

    case 'hidden': {
      if (state.hiddenIds.includes(action.id)) return state;
      return {
        ...state,
        hiddenIds: [...state.hiddenIds, action.id],
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, body: '', hidden: true } : m
        ),
      };
    }

    case 'hiddenUsers': {
      const hiddenUsers = [...new Set(action.userIds)].sort();
      if (
        hiddenUsers.length === state.hiddenUsers.length &&
        hiddenUsers.every((u, i) => u === state.hiddenUsers[i])
      ) {
        return state;
      }
      const blocked = new Set(hiddenUsers);
      return {
        ...state,
        hiddenUsers,
        // Un blocage efface aussi ce qui était déjà affiché ; un déblocage
        // ne fait rien revenir (le fil se relit à la prochaine entrée).
        messages: state.messages.filter((m) => !blocked.has(m.userId)),
      };
    }

    case 'muted':
      return { ...state, mutedUntil: later(state.mutedUntil, action.until) };

    case 'unmuted':
      return state.mutedUntil === null ? state : { ...state, mutedUntil: null };

    case 'reset':
      return initialChatFeed(state.hiddenUsers);
  }
}

/** En sourdine à `nowMs` ? */
export function isMutedAt(mutedUntil: string | null, nowMs: number): boolean {
  if (!mutedUntil) return false;
  const until = Date.parse(mutedUntil);
  return Number.isFinite(until) && until > nowMs;
}
