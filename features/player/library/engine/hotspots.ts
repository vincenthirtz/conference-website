// Les ZONES INTERACTIVES d'une salle (lot 7 de docs/PLAN-womens-library.md) :
// un panneau d'annonces, une porte, un rayonnage, un guichet, un panneau de
// QG… Un appui dessus ne fait pas marcher : le contrôleur appelle
// `onHotspotTap({ id, anchor })` et l'écran décide (ouvrir un panneau, changer
// de lieu).
//
// ORDRE DU TEST, en mode `walk` (engine/controller.ts) : une autre joueuse
// d'abord (son image passe devant tout), PUIS les zones, PUIS le sol (marcher).
// Entre zones : la plus en avant (boîte projetée), un pan de mur en dernier.
// À la souris, le survol d'une zone met le curseur en main, son nom en
// infobulle (`title`), et l'éclaire : le contour du meuble (`item`), sinon la
// case à son pied. Au doigt, tout passe par l'appui.
//
// DÉCLARER SES ZONES (lots 7, 8, 9) — trois formes, en coordonnées de la
// salle, sans pixel (la caméra bouge, le zoom aussi) :
//   - `item`  : l'IMAGE d'un meuble posé, par son identifiant dans la salle
//               (`RoomItem.id`, ex. `notice-board` du hall) ;
//   - `area`  : un pavé posé sur des cases (bornes max EXCLUES, comme
//               `readingRoom/hotspots.ts`), haut de `heightM` mètres — par
//               défaut, la hauteur du plus haut meuble qu'il couvre ;
//   - `wall`  : un pan d'un mur du fond (`side`, première case `at`, `span`
//               cases, `heightM` mètres) — une porte, un panneau mural.
// Les déclarations (`HotspotDecl`) vivent avec le décor (`layouts/*`) ou avec
// le lot qui les porte ; l'écran leur donne un nom DÉJÀ traduit (`label`, le
// moteur n'a pas d'i18n) et route l'appui par sorte de salle
// (`ui/places/useRoomHotspots.ts` — lot 9 y ajoute `team_hq`). Une zone n'est
// qu'un raccourci : son contenu reste atteignable sans le canvas (clavier,
// lecteur d'écran), sous la scène.

import { type Box3, boxContainsScreenPoint, centerDepth } from './depthSort';
import {
  type Camera,
  canvasToWorld,
  gridToScreen,
  pickTile,
  type ScreenPoint,
  TILE_H,
  TILE_W,
  type Tile,
  wallFootTile,
  worldToCanvas,
  Z_PX,
} from './projection';
import { type FurnitureCatalog, itemBox, type RoomItem, specOf } from './room';

/** Cases couvertes ; bornes max EXCLUES. */
export type HotspotArea = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type HotspotShape =
  | { kind: 'item'; itemId: string }
  | { kind: 'area'; area: HotspotArea; heightM?: number }
  | {
      kind: 'wall';
      side: 'left' | 'right';
      at: number;
      span: number;
      heightM: number;
    };

/** Une zone telle que la déclare un décor : son nom est une CLÉ de traduction. */
export type HotspotDecl = { id: string; labelKey: string; shape: HotspotShape };

/** Une zone telle que la reçoit le moteur : son nom est DÉJÀ traduit. */
export type LibraryHotspot = {
  id: string;
  label?: string;
  shape: HotspotShape;
};

/** Un appui sur une zone ; `anchor` : au-dessus d'elle, px CSS du conteneur. */
export type HotspotTap = { id: string; anchor: ScreenPoint };

/** Ce que le test lit du monde : ses meubles et son catalogue. */
export type HotspotWorld = {
  room: { items: readonly RoomItem[] };
  catalog: FurnitureCatalog;
};

/** Hauteur d'un pavé qui ne couvre aucun meuble (une zone au sol). */
const FLAT_M = 0.1;

function areaBox(
  world: HotspotWorld,
  area: HotspotArea,
  heightM?: number
): Box3 {
  let top = heightM ?? FLAT_M;
  if (heightM === undefined) {
    for (const item of world.room.items) {
      const b = itemBox(item, specOf(world.catalog, item.key));
      const covered =
        b.minX < area.maxX &&
        b.maxX > area.minX &&
        b.minY < area.maxY &&
        b.maxY > area.minY;
      if (covered) top = Math.max(top, b.maxZ);
    }
  }
  return {
    minX: area.minX,
    maxX: area.maxX,
    minY: area.minY,
    maxY: area.maxY,
    minZ: 0,
    maxZ: top,
  };
}

/** La boîte d'une zone posée (`item`, `area`) ; null pour un mur ou un meuble absent. */
export function hotspotBox(
  world: HotspotWorld,
  shape: HotspotShape
): Box3 | null {
  if (shape.kind === 'area') return areaBox(world, shape.area, shape.heightM);
  if (shape.kind !== 'item') return null;
  const item = world.room.items.find((i) => i.id === shape.itemId);
  return item ? itemBox(item, specOf(world.catalog, item.key)) : null;
}

/** Le point `(sx, sy)` du MONDE est-il sur ce pan de mur ? */
export function wallContains(
  shape: Extract<HotspotShape, { kind: 'wall' }>,
  sx: number,
  sy: number
): boolean {
  // Mur droit : gy = 0, sx = gx·TILE_W/2 ; mur gauche : gx = 0, sx = −gy·TILE_W/2.
  const along = (shape.side === 'right' ? sx : -sx) / (TILE_W / 2);
  if (along < shape.at || along >= shape.at + shape.span) return false;
  const z = (along * (TILE_H / 2) - sy) / Z_PX;
  return z >= 0 && z <= shape.heightM;
}

/** Au-dessus du milieu d'une zone (px du MONDE). */
function topOf(world: HotspotWorld, shape: HotspotShape): ScreenPoint | null {
  if (shape.kind === 'wall') {
    const mid = shape.at + shape.span / 2;
    return shape.side === 'right'
      ? gridToScreen(mid, 0, shape.heightM)
      : gridToScreen(0, mid, shape.heightM);
  }
  const b = hotspotBox(world, shape);
  return b
    ? gridToScreen((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, b.maxZ)
    : null;
}

/** La case qu'éclaire le survol d'une zone sans meuble (null : un meuble, son contour). */
function footOf(shape: HotspotShape): Tile | null {
  if (shape.kind === 'item') return null;
  if (shape.kind === 'wall')
    return wallFootTile({
      side: shape.side,
      at: shape.at + Math.floor(shape.span / 2),
      z: 0,
    });
  return { i: shape.area.minX, j: shape.area.maxY - 1 };
}

/** La zone sous le point `(sx, sy)` du MONDE : la plus en avant, un mur en dernier. */
export function hotspotAt(
  world: HotspotWorld,
  list: readonly LibraryHotspot[],
  sx: number,
  sy: number
): LibraryHotspot | null {
  let best: LibraryHotspot | null = null;
  let bestDepth = Number.NEGATIVE_INFINITY;
  let wall: LibraryHotspot | null = null;
  for (const spot of list) {
    if (spot.shape.kind === 'wall') {
      if (!wall && wallContains(spot.shape, sx, sy)) wall = spot;
      continue;
    }
    const box = hotspotBox(world, spot.shape);
    if (!box || !boxContainsScreenPoint(box, sx, sy)) continue;
    const depth = centerDepth(box);
    if (depth > bestDepth) {
      best = spot;
      bestDepth = depth;
    }
  }
  return best ?? wall;
}

/**
 * Les zones d'un contrôleur. `canvas` reçoit curseur, infobulle et repère
 * `data-hotspot` (lisible par un test e2e) ; `host.setSelection` éclaire un
 * meuble (contour de sélection) ou rien.
 */
export class HotspotLayer {
  private list: readonly LibraryHotspot[] = [];
  private hovered: string | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    list: readonly LibraryHotspot[] | undefined,
    private host: { setSelection: (itemId: string | null) => void }
  ) {
    this.set(list ?? []);
  }

  /** Remplace les zones (un survol en cours est effacé). */
  set(list: readonly LibraryHotspot[]): void {
    this.list = [...list];
    this.mark(null);
  }

  get size(): number {
    return this.list.length;
  }

  /** L'appui sur un point du canvas (px CSS) : la zone visée, ou null. */
  at(world: HotspotWorld, cam: Camera, p: ScreenPoint): HotspotTap | null {
    if (this.list.length === 0) return null;
    const w = canvasToWorld(p, cam);
    const spot = hotspotAt(world, this.list, w.x, w.y);
    const top = spot ? topOf(world, spot.shape) : null;
    return spot && top
      ? { id: spot.id, anchor: worldToCanvas(top, cam) }
      : null;
  }

  /**
   * Survol à la souris (`p` null : le pointeur sort). Rend la case à
   * éclairer : au pied de la zone survolée (null pour un meuble, éclairé par
   * son contour), sinon celle du sol sous le pointeur.
   */
  hover(
    world: HotspotWorld & { room: { w: number; d: number } },
    cam: Camera,
    p: ScreenPoint | null
  ): Tile | null {
    if (!p) {
      this.mark(null);
      return null;
    }
    const w = canvasToWorld(p, cam);
    const spot =
      this.list.length > 0 ? hotspotAt(world, this.list, w.x, w.y) : null;
    this.mark(spot);
    return spot ? footOf(spot.shape) : pickTile(p.x, p.y, cam, world.room);
  }

  private mark(spot: LibraryHotspot | null): void {
    const id = spot?.id ?? null;
    if (id === this.hovered) return;
    this.hovered = id;
    const c = this.canvas;
    c.style.cursor = spot ? 'pointer' : '';
    c.title = spot?.label ?? '';
    c.dataset.hotspot = id ?? '';
    this.host.setSelection(
      spot?.shape.kind === 'item' ? spot.shape.itemId : null
    );
  }
}
