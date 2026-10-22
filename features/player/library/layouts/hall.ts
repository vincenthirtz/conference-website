// Le hall de la Women's Library (lot 7) : 28 × 22 cases = 14 m × 11 m.
// Décor fixe, posé en dur :
//   - sol de marbre, murs « library » (lambris, plâtre, corniche) ;
//   - mur gauche : fenêtres et porte d'entrée ;
//   - mur droit : porte vers la Grande salle de lecture (gx 3), rayonnage
//     encastré derrière l'accueil, porte vers les QG d'équipe (gx 22) ;
//   - l'accueil (comptoir et sa chaise) devant le rayonnage encastré ;
//   - le panneau d'annonces, bien en vue, contre le mur droit ;
//   - le tableau du tournoi en cours (un tableau noir), à sa droite ;
//   - un salon (tapis, canapé, fauteuils, table basse), des bancs, des
//     plantes, deux lampadaires et un buste.
// Positions pensées pour les empreintes du manifeste (test :
// tests/unit/libraryLayouts.test.ts).
//
// SALLE VIVANTE (lot 7) : les dimensions sont celles que l'API donne à la
// salle (`config/library/commonRooms.ts`, copie synchronisée) ; les ZONES
// (`HALL_HOTSPOTS`, engine/hotspots.ts) sont le panneau d'annonces, le
// tableau du tournoi et les trois portes, routées par
// `ui/places/useRoomHotspots.ts`.

import { LIBRARY_COMMON_ROOMS } from '@/config/library/commonRooms';
import type { HotspotDecl } from '../engine/hotspots';
import type { RoomItem, RoomModel } from '../engine/room';

/** Portes du hall (case de départ de la variante `door` sur son mur). */
export const HALL_DOORS = {
  entrance: { side: 'left', at: 9 },
  readingRoom: { side: 'right', at: 3 },
  teamHq: { side: 'right', at: 22 },
} as const;

/** Largeur (cases) et hauteur (m) d'une porte du manifeste (`walls.library`). */
export const DOOR_SPAN = 2;
export const DOOR_HEIGHT_M = 2.2;

/**
 * Les zones du hall : leur `id` est ce que reçoit l'écran du hall.
 * `halloween` (lot 16) : la citrouille, posée par un calque de saison
 * (`halloween/hallDecor.ts`) et absente de `HALL_HOTSPOTS` hors événement.
 */
export const HALL_SPOT_IDS = [
  'board',
  'tournament_board',
  'reading_room',
  'apartments',
  'team_hq',
  'halloween',
] as const;
export type HallSpotId = (typeof HALL_SPOT_IDS)[number];

const door = (d: { side: 'left' | 'right'; at: number }) =>
  ({ kind: 'wall', ...d, span: DOOR_SPAN, heightM: DOOR_HEIGHT_M }) as const;

/**
 * Le panneau d'annonces (son image), le tableau du tournoi (le sien), la
 * porte de la Grande salle de lecture, celle des appartements (l'entrée, côté
 * rue) et celle des QG d'équipe. `labelKey` : clé de `playerLibraryHall.spots`.
 */
export const HALL_HOTSPOTS: readonly (HotspotDecl & { id: HallSpotId })[] = [
  {
    id: 'board',
    labelKey: 'board',
    shape: { kind: 'item', itemId: 'notice-board' },
  },
  {
    id: 'tournament_board',
    labelKey: 'tournamentBoard',
    shape: { kind: 'item', itemId: 'tournament-board' },
  },
  {
    id: 'reading_room',
    labelKey: 'readingRoom',
    shape: door(HALL_DOORS.readingRoom),
  },
  {
    id: 'apartments',
    labelKey: 'apartments',
    shape: door(HALL_DOORS.entrance),
  },
  { id: 'team_hq', labelKey: 'teamHq', shape: door(HALL_DOORS.teamHq) },
];

const items: RoomItem[] = [
  // Accueil, devant le rayonnage encastré.
  { id: 'reception', key: 'reception_desk', gx: 11, gy: 5, r: 0 },
  { id: 'reception-chair', key: 'chair', gx: 13, gy: 3, r: 0 },
  { id: 'reception-plant-l', key: 'plant_medium', gx: 9, gy: 5, r: 0 },
  { id: 'reception-plant-r', key: 'plant_medium', gx: 17, gy: 5, r: 0 },
  // Panneau d'annonces, entre la porte de la salle de lecture et la fenêtre.
  // Une case de plus vers la fenêtre (lot 7) : posé en gx 5, son image
  // couvrait le bas de la porte, qui ne se visait plus.
  { id: 'notice-board', key: 'notice_board', gx: 6, gy: 1, r: 0 },
  // Tableau du tournoi en cours, contre le mur droit, à droite du panneau
  // d'annonces : une case d'écart à l'écran (ni le panneau ni une porte ne
  // passent derrière lui — tests/unit/libraryHallModel.test.ts).
  { id: 'tournament-board', key: 'chalkboard', gx: 11, gy: 0, r: 0 },
  // Salon.
  { id: 'lounge-rug', key: 'rug_red', gx: 10, gy: 12, r: 0 },
  { id: 'lounge-sofa', key: 'sofa', gx: 11, gy: 10, r: 0 },
  { id: 'lounge-table', key: 'coffee_table', gx: 11, gy: 13, r: 0 },
  { id: 'lounge-chair-l', key: 'armchair', gx: 8, gy: 13, r: 1 },
  { id: 'lounge-chair-r', key: 'armchair_green', gx: 15, gy: 13, r: 3 },
  { id: 'lounge-lamp-l', key: 'floor_lamp', gx: 8, gy: 11, r: 0 },
  { id: 'lounge-lamp-r', key: 'floor_lamp', gx: 16, gy: 11, r: 0 },
  // Second salon, côté QG, autour d'un tapis rond.
  { id: 'side-rug', key: 'rug_round', gx: 20, gy: 13, r: 0 },
  { id: 'side-table', key: 'coffee_table_round', gx: 20, gy: 13, r: 0 },
  { id: 'side-chair-a', key: 'lounge_chair', gx: 20, gy: 10, r: 0 },
  { id: 'side-chair-b', key: 'rocking_chair', gx: 24, gy: 13, r: 3 },
  // Bancs le long des murs.
  { id: 'bench-right', key: 'bench', gx: 18, gy: 1, r: 0 },
  { id: 'bench-left', key: 'bench', gx: 1, gy: 4, r: 1 },
  { id: 'bench-left-2', key: 'bench', gx: 1, gy: 16, r: 1 },
  // Plantes aux angles et près des portes.
  { id: 'plant-corner', key: 'plant_tall', gx: 0, gy: 0, r: 0 },
  { id: 'plant-door-reading', key: 'plant_tall', gx: 1, gy: 1, r: 0 },
  { id: 'plant-door-hq', key: 'plant_tall', gx: 25, gy: 1, r: 0 },
  { id: 'plant-entrance-a', key: 'plant_medium', gx: 1, gy: 8, r: 0 },
  { id: 'plant-entrance-b', key: 'plant_medium', gx: 1, gy: 12, r: 0 },
  { id: 'plant-front-l', key: 'plant_tall', gx: 0, gy: 21, r: 0 },
  { id: 'plant-front-r', key: 'plant_tall', gx: 27, gy: 21, r: 0 },
  { id: 'plant-back-r', key: 'plant_tall', gx: 27, gy: 0, r: 0 },
  // Buste à l'entrée, côté salle de lecture.
  { id: 'bust', key: 'bust_pedestal', gx: 3, gy: 4, r: 0 },
  // Décor mural.
  { id: 'painting', key: 'frame_painting', gx: 15, gy: 0, r: 0 },
  { id: 'clock', key: 'wall_clock', gx: 20, gy: 0, r: 0 },
  { id: 'mirror', key: 'mirror', gx: 0, gy: 18, r: 1 },
  { id: 'portrait', key: 'frame_modern', gx: 0, gy: 11, r: 1 },
];

export const HALL_ROOM: RoomModel = {
  w: LIBRARY_COMMON_ROOMS.hall.width,
  d: LIBRARY_COMMON_ROOMS.hall.depth,
  wallHeight: 2.8,
  items,
  decor: {
    floor: 'marble',
    wallStyle: 'library',
    right: [
      { at: HALL_DOORS.readingRoom.at, variant: 'door' },
      { at: 8, variant: 'window' },
      { at: 12, variant: 'bookshelf' },
      { at: 22, variant: 'door' },
    ],
    left: [
      { at: 2, variant: 'window' },
      { at: HALL_DOORS.entrance.at, variant: 'door' },
      { at: 14, variant: 'window' },
    ],
  },
};

/** Arrivée par l'entrée du mur gauche. */
export const HALL_PLAYER_START = { i: 3, j: 10 };
