// features/player/library/hallResponses.ts — réponses des routes du hall de la
// Women's Library (lot 7 de docs/PLAN-womens-library.md, conference-website),
// lues par le site (copie synchronisée).
//
// Types et constantes PURS, comme `./responses.ts` : le site ne tire jamais un
// `service/` ni un `repository/` (apiOwnershipGuard).

import type { LibraryCommonRoomKind } from '../../../config/library/commonRooms';

/** `POST /api/player/library/rooms/common` — la salle, à ouvrir par `enter`. */
export type LibraryCommonRoomResponse = {
  roomId: string;
  kind: LibraryCommonRoomKind;
};

/**
 * Une annonce du panneau du hall : une news PUBLIÉE au tag `announcements`
 * (arrivée de Discord par `news-forwarder.js`, ou écrite sur le site).
 */
export type LibraryHallAnnouncement = {
  id: string;
  /** L'article sur le site : `/news/<slug>`. */
  slug: string;
  title: string;
  /** Texte BRUT, court (le chapô, ou le début du contenu sans Markdown). */
  excerpt: string;
  /**
   * Le contenu en MARKDOWN BRUT (jamais du HTML) : le site le rend avec son
   * rendu d'actualités, sans HTML brut. Coupé au-delà d'une borne
   * (`contentTruncated`) : la suite se lit sur le site.
   */
  content: string;
  contentTruncated: boolean;
  /** `null` : publiée sans date (rare). */
  publishedAt: string | null;
};

/** `GET /api/player/library/hall/announcements` — les plus récentes d'abord. */
export type LibraryHallAnnouncementsResponse = {
  announcements: LibraryHallAnnouncement[];
};

/**
 * Un appartement OUVERT dont la propriétaire a choisi d'apparaître dans la
 * liste du hall. Ni l'identifiant de la propriétaire, ni qui s'y trouve.
 */
export type LibraryOpenRoomEntry = {
  roomId: string;
  /** `null` = pas de nom choisi : « l'appartement de <pseudo> ». */
  name: string | null;
  ownerNickname: string;
};

/** `GET /api/player/library/rooms/open`. */
export type LibraryOpenRoomsResponse = {
  rooms: LibraryOpenRoomEntry[];
  /** À renvoyer (`cursor`) pour la page suivante ; `null` : c'est la fin. */
  nextCursor: string | null;
};

/** Codes des refus que l'interface traduit. */
export const LIBRARY_HALL_CODES = {
  /** `cursor` illisible (pas un curseur rendu par la route). */
  invalidCursor: 'invalid_cursor',
} as const;
