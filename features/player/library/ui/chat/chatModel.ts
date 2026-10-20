// features/player/library/ui/chat/chatModel.ts — fonctions PURES de l'interface
// du chat de la Women's Library (lot 6 de docs/PLAN-womens-library.md) :
//   - la clé de traduction d'un refus de l'API, et ses détails (`until`,
//     `retryAfterMs`, `max`) ;
//   - les durées de sourdine proposées ;
//   - les bulles de chat posées sur les avatars du moteur (la plus récente
//     de la bulle d'un signe et de celle d'un message gagne).
// Aucun réseau, aucune horloge, aucun import de VALEUR du moteur : testé seul.

import type { BubbleContent, RemoteAvatarInput } from '../../engine/remotes';
import { libraryErrorCode, libraryErrorField } from '../../model';
import { LIBRARY_CHAT_CODES } from '../../chat/responses';
import {
  LIBRARY_CHAT_MUTE_DEFAULT_MINUTES,
  LIBRARY_CHAT_MUTE_MAX_MINUTES,
} from '../../chat/schemas';
import { chatBubbleKey } from '../../realtime/chatBubble';
import type { LibraryChatMessage } from '../../chat/responses';

/* -------------------------------------------------- les refus traduits --- */

type ChatCode = (typeof LIBRARY_CHAT_CODES)[keyof typeof LIBRARY_CHAT_CODES];

/** Une clé de `playerLibraryChat.errors`. */
export type ChatErrorKey =
  | ChatCode
  /** La salle ne m'est plus ouverte (expulsion, blocage, salle disparue). */
  | 'room_closed'
  | 'library_banned'
  | 'rate_limited'
  | 'generic';

export type ChatError = {
  key: ChatErrorKey;
  /** Fin d'une sourdine (`chat_muted`). */
  until?: string;
  /** Attente avant le prochain message (`chat_too_fast`). */
  retryAfterMs?: number;
  /** Longueur maximale (`chat_too_long`). */
  max?: number;
};

const CHAT_CODES: ReadonlySet<string> = new Set(
  Object.values(LIBRARY_CHAT_CODES)
);
const ROOM_CODES: ReadonlySet<string> = new Set([
  'room_forbidden',
  'room_kicked',
  'room_not_found',
]);

function statusOf(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

/** Le refus d'une route du chat (`PlayerHttpError`) → sa clé et ses détails. */
export function chatErrorOf(err: unknown): ChatError {
  const code = libraryErrorCode(err);
  if (code && CHAT_CODES.has(code)) {
    const out: ChatError = { key: code as ChatCode };
    const until = libraryErrorField(err, 'until');
    const retry = libraryErrorField(err, 'retryAfterMs');
    const max = libraryErrorField(err, 'max');
    if (typeof until === 'string') out.until = until;
    if (typeof retry === 'number') out.retryAfterMs = retry;
    if (typeof max === 'number') out.max = max;
    return out;
  }
  if (code && ROOM_CODES.has(code)) return { key: 'room_closed' };
  if (code === 'LIBRARY_BANNED') return { key: 'library_banned' };
  if (statusOf(err) === 429) return { key: 'rate_limited' };
  return { key: 'generic' };
}

/** Secondes à attendre, arrondies au-dessus (au moins 1). */
export function retrySeconds(retryAfterMs: number | undefined): number {
  return Math.max(1, Math.ceil((retryAfterMs ?? 1000) / 1000));
}

/* ------------------------------------------------------------ la saisie --- */

/** Longueur en caractères visibles, comme l'API (points de code). */
export function chatLength(text: string): number {
  return [...text.trim()].length;
}

/* ----------------------------------------------------------- la sourdine --- */

export type MuteChoiceKey = 'min30' | 'hour1' | 'hours24';

/** Les durées proposées ; la première est le défaut. */
export const CHAT_MUTE_CHOICES: ReadonlyArray<{
  key: MuteChoiceKey;
  minutes: number;
}> = [
  { key: 'min30', minutes: LIBRARY_CHAT_MUTE_DEFAULT_MINUTES },
  { key: 'hour1', minutes: 60 },
  { key: 'hours24', minutes: LIBRARY_CHAT_MUTE_MAX_MINUTES },
];

/* ------------------------------------------------------------ les bulles --- */

/** La dernière bulle de chat d'une joueuse, datée à la RÉCEPTION. */
export type ChatBubble = { key: string; text: string; shownAt: number };

/** Le message reçu → sa bulle. */
export function chatBubbleOf(
  message: Pick<LibraryChatMessage, 'id' | 'body'>,
  receivedAt: number
): ChatBubble {
  return {
    key: chatBubbleKey(message.id),
    text: message.body,
    shownAt: receivedAt,
  };
}

/**
 * Les autres joueuses, avec la bulle la plus RÉCENTE : celle d'un signe
 * (emote, phrase) ou celle d'un message. L'ordre et le reste ne changent pas ;
 * sans bulle de chat à poser, le tableau reçu est rendu tel quel.
 */
export function withChatBubbles(
  remote: readonly RemoteAvatarInput[],
  bubbles: ReadonlyMap<string, ChatBubble>
): RemoteAvatarInput[] {
  if (bubbles.size === 0) return remote as RemoteAvatarInput[];
  let changed = false;
  const out = remote.map((r) => {
    const chat = bubbles.get(r.id);
    if (!chat) return r;
    if (r.bubble && r.bubble.shownAt >= chat.shownAt) return r;
    changed = true;
    return {
      ...r,
      bubble: {
        key: chat.key,
        glyph: null,
        text: chat.text,
        shownAt: chat.shownAt,
      },
    };
  });
  return changed ? out : (remote as RemoteAvatarInput[]);
}

/** Ma bulle de chat → ce que le moteur montre au-dessus de moi. */
export function playerChatBubble(bubble: ChatBubble): BubbleContent {
  return { key: bubble.key, glyph: null, text: bubble.text };
}
