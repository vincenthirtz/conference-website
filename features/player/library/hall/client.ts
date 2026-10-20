// features/player/library/hall/client.ts — appels typés du hall de la Women's
// Library (lot 7 de docs/PLAN-womens-library.md) : ouvrir une salle commune,
// lire le panneau d'annonces, la liste des appartements ouverts. Les URLs
// vivent ici ; `ui/` ne touche pas le réseau.
//
// Routes « soi seulement » (`subject: 'self'`) : aucune portée `?as=`.
//
// OUVRIR UNE SALLE COMMUNE PART SANS IDEMPOTENCY-KEY : c'est un lire-ou-créer
// (rejouer rend la même salle), et rien ne doit s'écrire au nom de la joueuse
// quand elle va dans la Grande salle de lecture (« aucune trace de qui la
// fréquente », plan section 4).

import { playerRequest } from '@/utils/player/playerHttp';
import type { LibraryCommonRoomKind } from '@/config/library/commonRooms';
import type {
  LibraryCommonRoomResponse,
  LibraryHallAnnouncementsResponse,
  LibraryOpenRoomsResponse,
} from '../hallResponses';

export const hallUrls = {
  commonRoom: '/api/player/library/rooms/common',
  announcements: '/api/player/library/hall/announcements',
  openRooms: '/api/player/library/rooms/open',
} as const;

export const hallClient = {
  /** La salle commune `kind` (créée à la première visite). */
  commonRoom: (kind: LibraryCommonRoomKind) =>
    playerRequest<LibraryCommonRoomResponse>(hallUrls.commonRoom, {
      method: 'POST',
      json: { kind },
      idempotent: false,
    }),
  announcements: () =>
    playerRequest<LibraryHallAnnouncementsResponse>(hallUrls.announcements),
  /** Une page ; `cursor` = le `nextCursor` de la précédente. */
  openRooms: (cursor?: string | null) =>
    playerRequest<LibraryOpenRoomsResponse>(
      cursor
        ? `${hallUrls.openRooms}?cursor=${encodeURIComponent(cursor)}`
        : hallUrls.openRooms
    ),
};

export type HallClient = typeof hallClient;
