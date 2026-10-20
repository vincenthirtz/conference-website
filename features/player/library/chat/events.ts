// features/player/library/chat/events.ts — ce que le SERVEUR diffuse pour le
// chat de la Women's Library (lot 6 de docs/PLAN-womens-library.md,
// conference-website). Module PUR (zod seul) : l'API diffuse avec ces noms,
// le site (copie synchronisée) écoute et valide avec les mêmes.
//
//   library:chat:<roomId>   `message`        un message enregistré ;
//                           `message_hidden` un message masqué : il disparaît
//                                            chez toutes.
//   library:user:<userId>   `muted`          MA sourdine (ici ou partout) ;
//                           `unmuted`        levée par le staff.
//
// SERVEUR SEUL : `library:chat:` et `library:user:` sont fermés en écriture
// aux clientes (policy `library_realtime_send`, database/migrations/
// library_realtime.sql). Personne ne peut y parler sous le nom d'une autre :
// le message part de l'API, qui a identifié l'autrice par sa session.
//
// UNE SOURDINE N'EST PAS ANNONCÉE À LA SALLE : seule la personne concernée la
// reçoit, dans sa boîte.

import * as z from 'zod';
import { looseUuid } from '../../_shared/zod';
import { LIBRARY_CHAT_MAX_CHARS } from './schemas';

export const LIBRARY_CHAT_EVENTS = {
  message: 'message',
  messageHidden: 'message_hidden',
  muted: 'muted',
  unmuted: 'unmuted',
} as const;
export type LibraryChatEventName =
  (typeof LIBRARY_CHAT_EVENTS)[keyof typeof LIBRARY_CHAT_EVENTS];

/** Au-delà, un payload reçu n'est même pas lu (JSON sérialisé, en caractères). */
export const LIBRARY_CHAT_PAYLOAD_MAX_CHARS = 2048;

const ID = looseUuid('Identifiant invalide.');
const ISO = z.string().min(10).max(40);

export const LibraryChatMessagePayload = z.object({
  id: ID,
  userId: ID,
  nickname: z.string().min(1).max(20),
  body: z.string().min(1).max(LIBRARY_CHAT_MAX_CHARS),
  createdAt: ISO,
});
export type LibraryChatMessagePayload = z.infer<
  typeof LibraryChatMessagePayload
>;

export const LibraryChatHiddenPayload = z.object({ id: ID });
export type LibraryChatHiddenPayload = z.infer<typeof LibraryChatHiddenPayload>;

export const LibraryChatMutedPayload = z.object({
  userId: ID,
  /** `null` = toute la Library. */
  roomId: ID.nullable(),
  until: ISO,
});
export type LibraryChatMutedPayload = z.infer<typeof LibraryChatMutedPayload>;

export const LibraryChatUnmutedPayload = z.object({
  userId: ID,
  roomId: ID.nullable(),
});
export type LibraryChatUnmutedPayload = z.infer<
  typeof LibraryChatUnmutedPayload
>;
