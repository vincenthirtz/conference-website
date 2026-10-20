// features/player/library/realtimeTopics.ts — les canaux temps réel PRIVÉS de
// la Women's Library et les événements que le SERVEUR y diffuse (lot 5 de
// docs/PLAN-womens-library.md, conference-website).
//
// Module PUR (zod seul) : l'API diffuse avec ces noms, le site (copie
// synchronisée) s'abonne et valide avec les mêmes. Les familles de sujets sont
// celles de la policy `library_can_join` (database/migrations/
// library_realtime.sql) : un sujet hors de ces quatre formes y est refusé.
//
//   library:room:<roomId>     Presence + Broadcast des joueuses. ÉCRIT PAR
//                             LES CLIENTES : rien n'y fait foi.
//   library:chat:<roomId>     le canal SERVEUR de la salle : le chat (lot 6)
//                             et `kicked`. Écrit par le serveur SEUL.
//   library:tenant:<tenantId> événements système de l'espace (`banned`).
//   library:user:<userId>     la boîte de la joueuse (`hide` / `unhide`).
//
// LES ÉVÉNEMENTS SERVEUR sont les seuls auxquels un client peut se fier pour
// une décision (quitter une salle, masquer quelqu'un) : ils ne s'écrivent
// qu'avec la clé service role, sur les trois sujets fermés en écriture aux
// clientes. Un `kicked` reçu sur `library:room:` est un FAUX (une cliente
// peut y écrire) : le site l'ignore. Les payloads des JOUEUSES (présence,
// case visée, emote) se valident côté site, et ne prouvent pas qui les
// envoie.

import * as z from 'zod';
import { looseUuid } from '../_shared/zod';

export const libraryTopics = {
  room: (roomId: string) => `library:room:${roomId}`,
  chat: (roomId: string) => `library:chat:${roomId}`,
  tenant: (tenantId: string) => `library:tenant:${tenantId}`,
  user: (userId: string) => `library:user:${userId}`,
} as const;

export type LibraryTopics = {
  room: string;
  chat: string;
  tenant: string;
  user: string;
};

/** Noms des événements diffusés par le serveur. */
export const LIBRARY_SERVER_EVENTS = {
  /** `library:chat:<id>` — une visiteuse expulsée par la propriétaire. */
  kicked: 'kicked',
  /** `library:tenant:<id>` — une joueuse bannie de la Library par le staff. */
  banned: 'banned',
  /**
   * `library:user:<id>` — ne plus voir `userId` (un blocage, posé par elle ou
   * contre elle — l'événement ne le dit pas), et quitter `leaveRoomId` si elle
   * s'y trouve. AUCUNE notice ne s'affiche : la personne bloquée n'en est pas
   * avertie.
   */
  hide: 'hide',
  /** `library:user:<id>` — `userId` redevient visible (blocage levé). */
  unhide: 'unhide',
} as const;
export type LibraryServerEvent =
  (typeof LIBRARY_SERVER_EVENTS)[keyof typeof LIBRARY_SERVER_EVENTS];

const USER_ID = looseUuid('Identifiant invalide.');
const ISO = z.string().min(10).max(40);

export const LibraryKickedPayload = z.object({
  userId: USER_ID,
  /** Fin de l'expulsion (ISO). */
  until: ISO,
});
export type LibraryKickedPayload = z.infer<typeof LibraryKickedPayload>;

export const LibraryBannedPayload = z.object({
  userId: USER_ID,
  /** `null` = définitif. */
  until: ISO.nullable(),
});
export type LibraryBannedPayload = z.infer<typeof LibraryBannedPayload>;

export const LibraryHidePayload = z.object({
  userId: USER_ID,
  /** Salle à quitter si on s'y trouve (l'appartement de l'autre), sinon `null`. */
  leaveRoomId: USER_ID.nullable(),
});
export type LibraryHidePayload = z.infer<typeof LibraryHidePayload>;

export const LibraryUnhidePayload = z.object({ userId: USER_ID });
export type LibraryUnhidePayload = z.infer<typeof LibraryUnhidePayload>;
