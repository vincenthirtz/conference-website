// La Grande salle de lecture (lot 8) : 40 × 30 cases = 20 m × 15 m, une salle
// de bibliothèque universitaire, silencieuse. Décor fixe, posé en dur :
//   - parquet en chevrons, murs « library » ; rayonnages encastrés et hautes
//     fenêtres en alternance sur les deux murs, porte du hall (mur droit, gx 2) ;
//   - au fond, six épis de rayonnages doubles (gx 6, 11 … 31, gy 2 à 10),
//     séparés par des allées de 3 cases, et des échelles ;
//   - une allée transversale (gy 11-12) puis neuf tables de lecture à lampes
//     vertes, en trois rangées, avec leurs chaises ; une allée le long du
//     bord avant (gy 29) ;
//   - deux coins lecture (tapis, fauteuils, lampadaire), un globe, des bustes
//     et des plantes.
// Positions pensées pour les empreintes du manifeste (test :
// tests/unit/libraryLayouts.test.ts).
//
// SALLE VIVANTE (lot 7) : les dimensions sont celles que l'API donne à la
// salle (`config/library/commonRooms.ts`, copie synchronisée). Le guichet
// (`reception_desk`, près de la porte) et les épis portent les zones du lot 8
// (`readingRoom/hotspots.ts`) ; la porte du hall porte `READING_HALL_DOOR`.

import { LIBRARY_COMMON_ROOMS } from '@/config/library/commonRooms';
import type { HotspotDecl } from '../engine/hotspots';
import type { Tile } from '../engine/projection';
import type { Rotation, RoomItem, RoomModel } from '../engine/room';
import { DOOR_HEIGHT_M, DOOR_SPAN } from './hall';

const items: RoomItem[] = [];
const put = (id: string, key: string, gx: number, gy: number, r: Rotation) =>
  items.push({ id, key, gx, gy, r });

/** Porte vers le hall (mur droit). */
export const READING_DOOR = { side: 'right', at: 2 } as const;

/** La zone de la porte du hall (`labelKey` : `playerLibraryHall.spots`). */
export const READING_HALL_DOOR: HotspotDecl = {
  id: 'hall',
  labelKey: 'hall',
  shape: {
    kind: 'wall',
    ...READING_DOOR,
    span: DOOR_SPAN,
    heightM: DOOR_HEIGHT_M,
  },
};

// Le guichet, à l'accueil : entre la porte du hall et le premier épi.
put('guichet', 'reception_desk', 1, 4, 0);

// Épis : rayonnages doubles tournés d'un quart (2 × 3 cases), trois par épi.
const STACK_COLUMNS = [6, 11, 16, 21, 26, 31];
for (const [c, gx] of STACK_COLUMNS.entries()) {
  for (const [k, gy] of [2, 5, 8].entries())
    put(`stack-${c}-${k}`, 'bookshelf_double', gx, gy, 1);
  // Une échelle sur deux allées, appuyée sur la face avant de l'épi.
  if (c % 2 === 0) put(`ladder-${c}`, 'library_ladder', gx + 2, 4 + c, 1);
}

// Tables de lecture (5 × 2) et leurs chaises : deux derrière (face à la
// caméra), deux devant (de dos).
const TABLE_COLUMNS = [9, 17, 25];
const TABLE_ROWS = [14, 20, 26];
for (const [row, gy] of TABLE_ROWS.entries()) {
  for (const [col, gx] of TABLE_COLUMNS.entries()) {
    const id = `table-${row}-${col}`;
    put(id, 'reading_table', gx, gy, 0);
    put(`${id}-chair-a`, 'chair', gx + 1, gy - 1, 0);
    put(`${id}-chair-b`, 'chair', gx + 3, gy - 1, 0);
    put(`${id}-chair-c`, 'chair', gx + 1, gy + 2, 2);
    put(`${id}-chair-d`, 'chair', gx + 3, gy + 2, 2);
  }
}

// Coin lecture, devant à gauche.
put('corner-l-rug', 'rug_green', 0, 22, 0);
put('corner-l-chair-a', 'armchair', 1, 22, 1);
put('corner-l-lamp', 'floor_lamp', 1, 24, 0);
put('corner-l-chair-b', 'armchair_green', 1, 25, 1);
put('corner-l-table', 'coffee_table_round', 4, 23, 0);
put('corner-l-ottoman', 'ottoman', 6, 27, 0);

// Coin lecture, devant à droite, autour d'un tapis rond.
put('corner-r-rug', 'rug_round', 33, 22, 0);
put('corner-r-lounge', 'lounge_chair', 33, 19, 0);
put('corner-r-rocking', 'rocking_chair', 37, 22, 3);
put('corner-r-side', 'side_table', 35, 20, 0);
put('corner-r-lamp', 'floor_lamp', 37, 20, 0);
put('corner-r-ottoman', 'ottoman', 33, 24, 0);

// Globe, bustes, plantes.
put('globe', 'globe', 36, 16, 0);
put('bust-l', 'bust_pedestal', 2, 13, 0);
put('bust-r', 'bust_pedestal', 37, 13, 0);
put('plant-back', 'plant_tall', 39, 0, 0);
put('plant-front-l', 'plant_tall', 0, 29, 0);
put('plant-front-r', 'plant_tall', 39, 29, 0);
put('plant-door', 'plant_tall', 0, 0, 0);

// Échelles contre les rayonnages encastrés des murs.
put('ladder-wall-r', 'library_ladder', 15, 0, 0);
put('ladder-wall-l', 'library_ladder', 0, 9, 1);

export const READING_ROOM: RoomModel = {
  w: LIBRARY_COMMON_ROOMS.reading_room.width,
  d: LIBRARY_COMMON_ROOMS.reading_room.depth,
  wallHeight: 2.8,
  items,
  decor: {
    floor: 'parquet',
    wallStyle: 'library',
    right: [
      { at: READING_DOOR.at, variant: 'door' },
      ...[5, 10, 15, 20, 25, 30, 35].map((at) => ({
        at,
        variant: 'bookshelf',
      })),
      ...[8, 13, 18, 23, 28, 33].map((at) => ({ at, variant: 'window' })),
    ],
    left: [
      ...[1, 8, 15, 22].map((at) => ({ at, variant: 'bookshelf' })),
      ...[5, 12, 19, 26].map((at) => ({ at, variant: 'window' })),
    ],
  },
};

/** Arrivée par la porte du hall. */
export const READING_PLAYER_START: Tile = { i: 3, j: 1 };
