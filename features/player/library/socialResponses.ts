// features/player/library/socialResponses.ts — réponses des routes
// « multijoueur et sécurité de base » de la Women's Library (lot 5 de
// docs/PLAN-womens-library.md, conference-website), lues par le site (copie
// synchronisée).
//
// Types et constantes PURS, comme `./responses.ts` : le site ne tire jamais un
// `service/` ni un `repository/` (apiOwnershipGuard).

import type { LibraryApartmentDecor } from '../../../config/library/decor';
import type { LibraryChatState } from './chat/responses';
import type { LibraryApartmentItem } from './responses';
import type { LibraryTopics } from './realtimeTopics';

export type LibraryRoomKind = 'hall' | 'reading_room' | 'team_hq' | 'apartment';
export type LibraryRoomAccess = 'private' | 'open' | 'team';

/** Une salle telle qu'on y entre. */
export type LibraryRoomView = {
  id: string;
  kind: LibraryRoomKind;
  /** `null` = pas de nom choisi : l'interface affiche un nom par défaut. */
  name: string | null;
  access: LibraryRoomAccess;
  /** Dimensions en cases de 0,5 m. */
  width: number;
  depth: number;
  decor: LibraryApartmentDecor;
  version: number;
  /** L'appelante est la propriétaire (appartement) : elle peut expulser. */
  isOwner: boolean;
  /** L'espace de la salle : son sujet `library:tenant:<id>`. */
  tenantId: string;
};

/** `POST /api/player/library/rooms/{roomId}/enter`. */
export type LibraryEnterResponse = {
  room: LibraryRoomView;
  items: LibraryApartmentItem[];
  /**
   * L'appelante peut se montrer (Presence `track()`, déplacements, emotes).
   * Toujours vrai en v1 ; `false` est réservé (un interrupteur par espace, une
   * restriction posée par le staff) et le client doit alors rester discret.
   */
  canBeVisible: boolean;
  /**
   * Entrer SANS être vue (Grande salle de lecture) : pas de `track()`, aucun
   * envoi — on reçoit seulement. Devenir visible est un choix explicite.
   */
  discreetByDefault: boolean;
  /**
   * Les joueuses à ne pas montrer : celles que J'AI bloquées ET celles qui
   * M'ONT bloquée, en UNE liste triée, sans dire qui a bloqué qui.
   */
  hiddenUserIds: string[];
  /** Les sujets à rejoindre (mêmes noms que `libraryTopics`). */
  topics: LibraryTopics;
  /** Ce que l'appelante annonce dans sa présence. */
  me: { userId: string; nickname: string; avatarId: string };
  /**
   * Le chat de la salle pour l'appelante (lot 6) : ouvert ? (interrupteur de
   * l'espace, jamais dans la Grande salle de lecture), peut-elle écrire,
   * modérer ? Fermé en cas de doute.
   */
  chat: LibraryChatState;
};

/** `GET /api/player/library/blocks` — mes blocages (jamais ceux posés contre moi). */
export type LibraryBlockEntry = {
  userId: string;
  /** `null` si son avatar n'existe plus. */
  nickname: string | null;
  createdAt: string;
};
export type LibraryBlocksResponse = { blocks: LibraryBlockEntry[] };

/** `POST` / `DELETE /api/player/library/blocks`. */
export type LibraryBlockResponse = { userId: string; blocked: boolean };

/** `POST /api/player/library/reports`. */
export type LibraryReportResponse = {
  reported: true;
  /** Les 8 premiers caractères du ticket : à citer à l'équipe de modération. */
  referenceShort: string;
};

/** `POST /api/player/library/apartment/kick`. */
export type LibraryKickResponse = {
  kicked: true;
  userId: string;
  /** Fin de l'expulsion (ISO). */
  until: string;
};

/** Codes des refus que l'interface traduit. */
export const LIBRARY_SOCIAL_CODES = {
  roomNotFound: 'room_not_found',
  /** Salle privée, réservée à une équipe, ou blocage : le motif n'est pas dit. */
  roomForbidden: 'room_forbidden',
  /** Expulsée de la salle (`until` rendu). */
  roomKicked: 'room_kicked',
  playerNotFound: 'player_not_found',
  cannotBlockSelf: 'cannot_block_self',
  cannotReportSelf: 'cannot_report_self',
  cannotKickSelf: 'cannot_kick_self',
  /** Expulser suppose un appartement à soi. */
  apartmentNotFound: 'apartment_not_found',
  reportFailed: 'report_failed',
} as const;
