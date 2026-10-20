// features/player/library/realtime/chatEvents.ts — écouter le chat d'une salle
// de la Women's Library sur les canaux SERVEUR (lot 6 de
// docs/PLAN-womens-library.md) :
//   - `library:chat:<salle>` : `message`, `message_hidden` ;
//   - `library:user:<moi>`   : `muted`, `unmuted` — MA sourdine, ici ou
//     partout (la salle n'en sait rien).
// Ces sujets ne s'écrivent qu'avec la clé service role : un message y est
// passé par l'API (droits, sourdine, rythme, filtre). On le valide quand même
// — taille bornée AVANT lecture, puis zod — et un payload douteux est JETÉ
// sans bruit. Les noms et schémas sont ceux de l'API (copie synchronisée :
// `../chat/events.ts`).

import {
  LIBRARY_CHAT_EVENTS,
  LIBRARY_CHAT_PAYLOAD_MAX_CHARS,
  LibraryChatHiddenPayload,
  LibraryChatMessagePayload,
  LibraryChatMutedPayload,
  LibraryChatUnmutedPayload,
} from '../chat/events';
import type { LibraryChatMessage } from '../chat/responses';
import type { LibraryChannel } from './connection';

/** Un événement du chat, déjà validé, pour la salle en cours. */
export type LibraryChatEvent =
  | { type: 'message'; message: LibraryChatMessage }
  | { type: 'hidden'; id: string }
  | { type: 'muted'; roomId: string | null; until: string }
  | { type: 'unmuted'; roomId: string | null };

/** Trop gros pour être lu ? (JSON sérialisé, sans le lire deux fois). */
export function isChatPayloadOversized(payload: unknown): boolean {
  try {
    const text = JSON.stringify(payload);
    return (
      typeof text !== 'string' || text.length > LIBRARY_CHAT_PAYLOAD_MAX_CHARS
    );
  } catch {
    return true;
  }
}

function parse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  payload: unknown
): T | null {
  if (isChatPayloadOversized(payload)) return null;
  const parsed = schema.safeParse(payload);
  return parsed.success ? (parsed.data as T) : null;
}

/** Un `message` reçu → le message, ou `null` (jeté). */
export function parseChatMessage(payload: unknown): LibraryChatMessage | null {
  return parse(LibraryChatMessagePayload, payload);
}

/**
 * Branche les écoutes du chat sur les deux canaux serveur déjà créés par la
 * connexion (`./connection.ts`). Une sourdine pour une AUTRE salle est
 * ignorée ; une sourdine « partout » (`roomId: null`) vaut ici.
 */
export function bindChatEvents(
  channels: { chat: LibraryChannel; user: LibraryChannel },
  ctx: { roomId: string; selfId: string },
  emit: (event: LibraryChatEvent) => void
): void {
  const concernsMe = (p: { userId: string; roomId: string | null }) =>
    p.userId === ctx.selfId && (p.roomId === null || p.roomId === ctx.roomId);

  channels.chat
    .on('broadcast', { event: LIBRARY_CHAT_EVENTS.message }, (msg) => {
      const message = parseChatMessage(msg?.payload);
      if (message) emit({ type: 'message', message });
    })
    .on('broadcast', { event: LIBRARY_CHAT_EVENTS.messageHidden }, (msg) => {
      const hidden = parse(LibraryChatHiddenPayload, msg?.payload);
      if (hidden) emit({ type: 'hidden', id: hidden.id });
    });

  channels.user
    .on('broadcast', { event: LIBRARY_CHAT_EVENTS.muted }, (msg) => {
      const muted = parse(LibraryChatMutedPayload, msg?.payload);
      if (muted && concernsMe(muted)) {
        emit({ type: 'muted', roomId: muted.roomId, until: muted.until });
      }
    })
    .on('broadcast', { event: LIBRARY_CHAT_EVENTS.unmuted }, (msg) => {
      const unmuted = parse(LibraryChatUnmutedPayload, msg?.payload);
      if (unmuted && concernsMe(unmuted)) {
        emit({ type: 'unmuted', roomId: unmuted.roomId });
      }
    });
}
