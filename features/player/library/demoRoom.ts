// Salle de démonstration du spike (lot 1) : 24 × 24 cases = 12 m × 12 m,
// posée en dur, sans réseau. Ambiance bibliothèque :
//   - une rangée de rayonnages contre chacun des deux murs du fond ;
//   - deux épis de rayonnages isolés (on passe devant et derrière) ;
//   - deux coins lecture, fauteuil + lampe ;
//   - une table de lecture au milieu.
// Positions pensées pour les empreintes attendues (rayonnage 3 × 2, fauteuil
// 2 × 2, lampe 2 × 1, table 4 × 2 — cases de 0,5 m). Les empreintes réelles
// viennent du manifeste ; le contrôleur signale un chevauchement éventuel.
// `table` n'existe qu'en boîte de remplacement.

import type { Tile } from './engine/projection';
import type { RoomItem, RoomModel } from './engine/room';

const wallRight: RoomItem[] = [3, 6, 9, 12, 15, 18].map((gx, k) => ({
  id: `shelf-r${k}`,
  key: 'bookshelf',
  gx,
  gy: 0,
  r: 0,
}));

const wallLeft: RoomItem[] = [3, 6, 9, 12, 15, 18].map((gy, k) => ({
  id: `shelf-l${k}`,
  key: 'bookshelf',
  gx: 0,
  gy,
  r: 1,
}));

export const DEMO_ROOM: RoomModel = {
  w: 24,
  d: 24,
  wallHeight: 2.6,
  items: [
    ...wallRight,
    ...wallLeft,
    { id: 'stack-a', key: 'bookshelf', gx: 8, gy: 7, r: 0 },
    { id: 'stack-b', key: 'bookshelf', gx: 13, gy: 7, r: 0 },
    // Coin lecture côté droit, puis côté avant gauche.
    { id: 'chair-a', key: 'armchair', gx: 19, gy: 8, r: 1 },
    { id: 'lamp-a', key: 'lamp', gx: 21, gy: 8, r: 0 },
    { id: 'chair-b', key: 'armchair', gx: 5, gy: 19, r: 3 },
    { id: 'lamp-b', key: 'lamp', gx: 5, gy: 21, r: 0 },
    { id: 'table-a', key: 'table', gx: 10, gy: 12, r: 0 },
  ],
};

export const DEMO_PLAYER_ID = 'me';
export const DEMO_PLAYER_START: Tile = { i: 12, j: 17 };
export const DEMO_BOT_COUNT = 29;
