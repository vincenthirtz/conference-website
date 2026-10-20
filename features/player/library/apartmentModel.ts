// features/player/library/apartmentModel.ts — de l'appartement rendu par l'API
// (`GET /api/player/library/apartment`) à la salle du moteur (`RoomModel`,
// engine/room.ts). Pur, testé seul ; n'importe du moteur que des TYPES (le
// moteur reste dans son chunk `next/dynamic`).
//
// LE DÉCOR (config/library/decor.ts, lots 4 et 12), lu par
// `resolveApartmentDecor` (un décor du lot 4, ou d'une API plus ancienne, se lit
// à l'identique) :
//   - `floor`  : le sol, qui EST la clé d'un sol du manifeste (`decor.floors`) ;
//   - `finish` : l'habillage des murs, qui EST un STYLE de mur du manifeste
//     (`decor.walls`, `library` au lot 3) ;
//   - `window` et `door` : des VARIANTES posées case par case sur les deux
//     murs du fond, aux places que donne `apartmentOpenings` (la porte sur le
//     mur gauche, les fenêtres au rythme du lot 4). Une variante absente du
//     manifeste est ignorée par le moteur (mur plein).

import {
  apartmentOpenings,
  resolveApartmentDecor,
} from '@/config/library/decor';
import type { RoomDecor, WallSlot } from './engine/decor';
import type { Tile } from './engine/projection';
import type { RoomItem, RoomModel, Rotation } from './engine/room';
import {
  isPlacementRotation,
  placementTiles,
  type PlacementSpec,
} from './placement';
import type {
  LibraryApartmentItem,
  LibraryApartmentResponse,
  LibraryApartmentRoom,
} from './responses';

/**
 * Ce que ces fonctions lisent d'une salle : l'appartement (`GET apartment`)
 * comme une salle où l'on entre (`POST rooms/:id/enter`, lot 5) en ont la
 * forme.
 */
export type RoomShape = Pick<LibraryApartmentRoom, 'width' | 'depth' | 'decor'>;
export type RoomWithItems = {
  room: RoomShape;
  items: readonly LibraryApartmentItem[];
};

/** Style de mur du manifeste d'un appartement du lot 4 (habillage par défaut). */
export const APARTMENT_WALL_STYLE = 'library';
/** Hauteur des murs (m) pour cadrer la vue ; le style porte la sienne. */
export const APARTMENT_WALL_HEIGHT_M = 2.6;
/** Largeur d'une fenêtre (cases) et pas entre deux fenêtres. */
export const WINDOW_SPAN = 2;
export const WINDOW_STEP = 4;

/** Fenêtres régulières le long d'un mur de `length` cases (aucune si `plain`). */
export function wallSlots(wall: string, length: number): WallSlot[] {
  if (wall !== 'window') return [];
  const out: WallSlot[] = [];
  for (let at = 1; at + WINDOW_SPAN <= length - 1; at += WINDOW_STEP)
    out.push({ at, variant: 'window' });
  return out;
}

export function apartmentDecor(room: RoomShape): RoomDecor {
  const decor = resolveApartmentDecor(room.decor);
  const openings = apartmentOpenings(room.width, room.depth, decor);
  return {
    floor: decor.floor,
    wallStyle: decor.finish,
    right: openings.right,
    left: openings.left,
  };
}

/** Les meubles posés (état édité) en meubles du moteur (id = ligne d'inventaire). */
export function toRoomItems(
  items: readonly {
    inventoryId: string;
    key: string;
    gx: number;
    gy: number;
    rotation: number;
  }[]
): RoomItem[] {
  return items.map((i) => ({
    id: i.inventoryId,
    key: i.key,
    gx: i.gx,
    gy: i.gy,
    r: (isPlacementRotation(i.rotation) ? i.rotation : 0) as Rotation,
  }));
}

/** La salle du moteur : dimensions, meubles posés (id = ligne d'inventaire), décor. */
export function apartmentRoomModel(apartment: RoomWithItems): RoomModel {
  const { room, items } = apartment;
  return {
    w: room.width,
    d: room.depth,
    wallHeight: APARTMENT_WALL_HEIGHT_M,
    items: items.map((i) => ({
      id: i.inventoryId,
      key: i.key,
      gx: i.gx,
      gy: i.gy,
      r: (isPlacementRotation(i.rotation) ? i.rotation : 0) as Rotation,
    })),
    decor: apartmentDecor(room),
  };
}

/**
 * Où apparaît l'avatar : la case libre la plus proche du centre de la salle
 * (un objet bloque ses cases ; tapis et décor mural non). Si tout est pris,
 * le centre quand même.
 */
export function apartmentStartTile(
  apartment: RoomWithItems,
  specs: ReadonlyMap<string, PlacementSpec>
): Tile {
  const { width, depth } = apartment.room;
  const blocked = new Uint8Array(Math.max(0, width * depth));
  for (const item of apartment.items) {
    const spec = specs.get(item.key);
    if (!spec || spec.layer !== 'object') continue;
    for (const t of placementTiles(item, spec)) {
      if (t.i >= 0 && t.j >= 0 && t.i < width && t.j < depth)
        blocked[t.j * width + t.i] = 1;
    }
  }
  const center = { i: Math.floor(width / 2), j: Math.floor(depth / 2) };
  let best: Tile | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let j = 0; j < depth; j++)
    for (let i = 0; i < width; i++) {
      if (blocked[j * width + i]) continue;
      const d = (i - center.i) ** 2 + (j - center.j) ** 2;
      if (d < bestDist) {
        best = { i, j };
        bestDist = d;
      }
    }
  return best ?? center;
}

/** Une clé stable du rendu : la salle change → le moteur est remonté. */
export function apartmentRenderKey(
  apartment: LibraryApartmentResponse
): string {
  const { room, items } = apartment;
  return JSON.stringify([
    room.id,
    room.width,
    room.depth,
    room.decor,
    items.map((i) => [i.inventoryId, i.key, i.gx, i.gy, i.rotation]),
  ]);
}
