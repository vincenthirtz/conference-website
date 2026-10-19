// Le hall de la Women's Library (lot 7) : 28 × 22 cases = 14 m × 11 m.
// Décor fixe, posé en dur :
//   - sol de marbre, murs « library » (lambris, plâtre, corniche) ;
//   - mur gauche : fenêtres et porte d'entrée ;
//   - mur droit : porte vers la Grande salle de lecture (gx 3), rayonnage
//     encastré derrière l'accueil, porte vers les QG d'équipe (gx 22) ;
//   - l'accueil (comptoir et sa chaise) devant le rayonnage encastré ;
//   - le panneau d'annonces, bien en vue, contre le mur droit ;
//   - un salon (tapis, canapé, fauteuils, table basse), des bancs, des
//     plantes, deux lampadaires et un buste.
// Positions pensées pour les empreintes du manifeste (test :
// tests/unit/libraryLayouts.test.ts).

import type { RoomItem, RoomModel } from '../engine/room';

/** Portes du hall (case de départ de la variante `door` sur son mur). */
export const HALL_DOORS = {
  entrance: { side: 'left', at: 9 },
  readingRoom: { side: 'right', at: 3 },
  teamHq: { side: 'right', at: 22 },
} as const;

const items: RoomItem[] = [
  // Accueil, devant le rayonnage encastré.
  { id: 'reception', key: 'reception_desk', gx: 11, gy: 5, r: 0 },
  { id: 'reception-chair', key: 'chair', gx: 13, gy: 3, r: 0 },
  { id: 'reception-plant-l', key: 'plant_medium', gx: 9, gy: 5, r: 0 },
  { id: 'reception-plant-r', key: 'plant_medium', gx: 17, gy: 5, r: 0 },
  // Panneau d'annonces, entre la porte de la salle de lecture et la fenêtre.
  { id: 'notice-board', key: 'notice_board', gx: 5, gy: 1, r: 0 },
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
  w: 28,
  d: 22,
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
