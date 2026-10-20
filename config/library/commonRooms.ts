// config/library/commonRooms.ts — les SALLES COMMUNES de la Women's Library
// (lot 7 de docs/PLAN-womens-library.md, conference-website) : le hall et la
// Grande salle de lecture. Une de chaque par espace (index unique partiel
// `library_rooms_one_common_room`, database/migrations/library_core.sql),
// créée à la première visite par `POST /api/player/library/rooms/common`.
//
// LES DIMENSIONS SONT CELLES DU DÉCOR FIXE DU SITE. Le hall et la salle de
// lecture ne se meublent pas : leur décor et leurs meubles sont posés en dur
// côté site (`features/player/library/layouts/hall.ts`, `readingRoom.ts`), qui
// LISENT ces dimensions (copie synchronisée) au lieu de les recopier. Les
// changer ici change la salle là-bas, à la synchro suivante ; une salle déjà
// créée garde les siennes en base (le site dessine celles du décor fixe).
//
// Le décor enregistré (`decor`) n'est qu'indicatif : `POST rooms/{id}/enter`
// le rend, le site dessine celui du décor fixe.
//
// Module PUR (imports de types seulement) : il est recopié tel quel dans le
// site.

import type { LibraryApartmentDecor } from './decor';

export const LIBRARY_COMMON_ROOM_KINDS = ['hall', 'reading_room'] as const;
export type LibraryCommonRoomKind = (typeof LIBRARY_COMMON_ROOM_KINDS)[number];

export type LibraryCommonRoomSpec = {
  /** Dimensions en cases de 0,5 m. */
  width: number;
  depth: number;
  /** Décor enregistré à la création (indicatif, cf. en-tête). */
  decor: LibraryApartmentDecor;
};

export const LIBRARY_COMMON_ROOMS: Readonly<
  Record<LibraryCommonRoomKind, LibraryCommonRoomSpec>
> = {
  /** Le hall : 28 × 22 cases = 14 m × 11 m. */
  hall: { width: 28, depth: 22, decor: { floor: 'marble', wall: 'window' } },
  /** La Grande salle de lecture : 40 × 30 cases = 20 m × 15 m. */
  reading_room: {
    width: 40,
    depth: 30,
    decor: { floor: 'parquet', wall: 'window' },
  },
};

const KINDS: ReadonlySet<string> = new Set(LIBRARY_COMMON_ROOM_KINDS);

export function isLibraryCommonRoomKind(
  value: unknown
): value is LibraryCommonRoomKind {
  return typeof value === 'string' && KINDS.has(value);
}
