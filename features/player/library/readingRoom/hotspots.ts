// features/player/library/readingRoom/hotspots.ts — les points de la Grande
// salle de lecture qu'un appui dans la vue ouvre (lot 8 de
// docs/PLAN-womens-library.md) : les rayonnages et le guichet.
//
// DÉCLARATIONS PURES, dérivées du décor fixe (`layouts/readingRoom.ts`) :
//   - RAYONNAGES : les épis de `bookshelf_double` (un épi = une colonne `gx`),
//     du plus proche de la porte au plus loin ; les quatre premiers portent,
//     dans l'ordre, les rayonnages de `./shelves.ts` (aide, guides,
//     signalement, charte) ;
//   - GUICHET : le premier `reception_desk` du décor. Il n'y en a pas encore :
//     sans lui, pas de point « guichet » dans la vue — le guichet reste sous
//     la scène (`ui/readingRoom`), toujours atteignable au clavier.
// Déplacer un épi dans le décor déplace son point : rien n'est recopié.
//
// À BRANCHER (lot 7, `engine/hotspots.ts` / `onHotspotTap`) : donner ces
// points au moteur dans la salle de lecture, et sur un appui appeler
// `requestReadingRoomSpot(id)` (`./spotRequests.ts`) — l'écran de la salle
// ouvre alors le panneau.
//
// Aucun import de VALEUR du moteur (il reste dans son chunk `next/dynamic`).

import { getFurniture } from '@/config/library/furniture';
import type { Tile } from '../engine/projection';
import type { RoomItem } from '../engine/room';
import { READING_ROOM } from '../layouts/readingRoom';
import { rotatedFootprint } from '../placement';
import { READING_ROOM_SHELF_IDS } from './shelves';
import type { ReadingRoomSpotId } from './spotRequests';

export type { ReadingRoomSpotId } from './spotRequests';

/** Cases couvertes ; bornes max EXCLUES (comme `PlacementRect`). */
export type TileArea = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ReadingRoomHotspot = { id: ReadingRoomSpotId; area: TileArea };

/** Le meuble d'un rayonnage, et celui du guichet. */
export const SHELF_FURNITURE_KEY = 'bookshelf_double';
export const GUICHET_FURNITURE_KEY = 'reception_desk';

/** Les cases d'un meuble posé (empreinte du catalogue, tournée), ou null. */
export function itemArea(
  item: Pick<RoomItem, 'key' | 'gx' | 'gy' | 'r'>
): TileArea | null {
  const furniture = getFurniture(item.key);
  if (!furniture) return null;
  const fp = rotatedFootprint(furniture.footprint, item.r);
  return {
    minX: item.gx,
    minY: item.gy,
    maxX: item.gx + fp.w,
    maxY: item.gy + fp.d,
  };
}

function union(a: TileArea, b: TileArea): TileArea {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Les points de la salle, à partir de ses meubles posés. */
export function readingRoomHotspots(
  items: readonly Pick<
    RoomItem,
    'key' | 'gx' | 'gy' | 'r'
  >[] = READING_ROOM.items
): ReadingRoomHotspot[] {
  const stacks = new Map<number, TileArea>();
  let guichet: TileArea | null = null;
  for (const item of items) {
    const area = itemArea(item);
    if (!area) continue;
    if (item.key === SHELF_FURNITURE_KEY) {
      const prev = stacks.get(item.gx);
      stacks.set(item.gx, prev ? union(prev, area) : area);
    } else if (item.key === GUICHET_FURNITURE_KEY && !guichet) {
      guichet = area;
    }
  }
  const shelves = [...stacks.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, READING_ROOM_SHELF_IDS.length)
    .map(([, area], index) => ({ id: READING_ROOM_SHELF_IDS[index], area }));
  return guichet ? [...shelves, { id: 'guichet', area: guichet }] : shelves;
}

function contains(area: TileArea, tile: Tile): boolean {
  return (
    tile.i >= area.minX &&
    tile.i < area.maxX &&
    tile.j >= area.minY &&
    tile.j < area.maxY
  );
}

/** Le point sous une case, ou null. */
export function hotspotAt(
  spots: readonly ReadingRoomHotspot[],
  tile: Tile
): ReadingRoomSpotId | null {
  return spots.find((s) => contains(s.area, tile))?.id ?? null;
}
