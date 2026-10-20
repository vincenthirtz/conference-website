// Dessin du décor fixe à partir des sprites (decor.ts) : sol en motif, ombre
// douce au pied des murs, segments des deux murs du fond. Chaque fonction
// renvoie false quand une image manque ou n'est pas encore décodée : le
// renderer garde alors son dessin procédural (tout ou rien par élément, pour
// ne jamais mélanger un mur à moitié texturé).
//
// APERÇU (lot 12) : `drawDecorScene` dessine le décor SEUL — tranche du
// plancher, sol, ombre, murs — avec les mêmes sprites et la même pose que la
// scène, pour l'aperçu des réglages de l'appartement. Là, un élément dont
// l'image manque est peint en aplat (l'aperçu ne reste jamais vide).

import type { ImageCache } from './assets';
import {
  floorPatternMatrix,
  type ManifestDecor,
  roomWalls,
  segmentOrigin,
  type WallSide,
  type WallVariant,
} from './decor';
import {
  type Camera,
  gridToScreen,
  metersToTiles,
  TILE_H,
  TILE_W,
} from './projection';
import type { RoomModel } from './room';

type Ctx = CanvasRenderingContext2D;

/** Profondeur (m) et opacité de l'ombre de contact au pied des murs. */
const WALL_SHADE_M = 0.45;
const WALL_SHADE_ALPHA = 0.24;

/** Motifs de sol créés une fois par image (et par contexte). */
export class PatternCache {
  private map = new Map<string, CanvasPattern | null>();

  get(ctx: Ctx, src: string, img: HTMLImageElement, m: number[]) {
    if (this.map.has(src)) return this.map.get(src) ?? null;
    const pattern = ctx.createPattern(img, 'repeat');
    if (pattern && typeof DOMMatrix !== 'undefined')
      pattern.setTransform(new DOMMatrix(m));
    this.map.set(src, pattern);
    return pattern;
  }
}

/** Passe le contexte en coordonnées GRILLE (au sol) : x = gx, y = gy. */
function toGrid(ctx: Ctx): void {
  ctx.transform(TILE_W / 2, TILE_H / 2, -TILE_W / 2, TILE_H / 2, 0, 0);
}

/** Sol de la salle en un seul remplissage ; false = pas de sprite prêt. */
export function drawFloorSprite(
  ctx: Ctx,
  room: RoomModel,
  decor: ManifestDecor,
  pixelRatio: number,
  images: ImageCache,
  patterns: PatternCache
): boolean {
  const key = room.decor?.floor;
  if (!key || !Object.hasOwn(decor.floors, key)) return false;
  const floor = decor.floors[key];
  const img = images.get(floor.src);
  if (!img) return false;
  const pattern = patterns.get(
    ctx,
    floor.src,
    img,
    floorPatternMatrix(floor, pixelRatio)
  );
  if (!pattern) return false;
  const pts = [
    gridToScreen(0, 0),
    gridToScreen(room.w, 0),
    gridToScreen(room.w, room.d),
    gridToScreen(0, room.d),
  ];
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = pattern;
  ctx.fill();
  return true;
}

/** Ombre de contact (occlusion ambiante) le long des deux murs du fond. */
export function drawWallShade(ctx: Ctx, room: RoomModel): void {
  const depth = metersToTiles(WALL_SHADE_M);
  ctx.save();
  toGrid(ctx);
  const dark = `rgba(20, 12, 8, ${WALL_SHADE_ALPHA})`;
  const clear = 'rgba(20, 12, 8, 0)';
  const right = ctx.createLinearGradient(0, 0, 0, depth);
  right.addColorStop(0, dark);
  right.addColorStop(1, clear);
  ctx.fillStyle = right;
  ctx.fillRect(0, 0, room.w, depth);
  const left = ctx.createLinearGradient(0, 0, depth, 0);
  left.addColorStop(0, dark);
  left.addColorStop(1, clear);
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, depth, room.d);
  ctx.restore();
}

type Placed = { variant: WallVariant; gx: number; gy: number };

function wallPlan(
  room: RoomModel,
  decor: ManifestDecor
): { placed: Placed[]; issues: string[] } | null {
  const key = room.decor?.wallStyle;
  if (!key || !Object.hasOwn(decor.walls, key)) return null;
  const style = decor.walls[key];
  const walls = roomWalls(room, style);
  const placed: Placed[] = [];
  for (const side of ['right', 'left'] as WallSide[]) {
    for (const seg of walls[side]) {
      const o = segmentOrigin(side, seg.at);
      placed.push({ variant: style[side][seg.variant], ...o });
    }
    const end = Object.hasOwn(style[side], 'end') ? style[side].end : null;
    if (end)
      placed.push({
        variant: end,
        ...(side === 'right' ? { gx: room.w, gy: 0 } : { gx: 0, gy: room.d }),
      });
  }
  return { placed, issues: walls.issues };
}

/** Problèmes de murs d'une salle (variantes inconnues, débordements…). */
export function wallPlanIssues(
  room: RoomModel,
  decor: ManifestDecor
): string[] {
  return wallPlan(room, decor)?.issues ?? [];
}

/**
 * Murs en sprites, posés par leur ancre. Tout ou rien : si une seule image
 * manque, false (le renderer dessine les murs procéduraux).
 */
export function drawWallSprites(
  ctx: Ctx,
  room: RoomModel,
  decor: ManifestDecor,
  pixelRatio: number,
  images: ImageCache
): boolean {
  const plan = wallPlan(room, decor);
  if (!plan) return false;
  const ready: { img: HTMLImageElement; p: Placed }[] = [];
  for (const p of plan.placed) {
    const img = images.get(p.variant.src);
    if (!img) return false;
    ready.push({ img, p });
  }
  for (const { img, p } of ready) {
    const o = gridToScreen(p.gx, p.gy);
    const v = p.variant;
    ctx.drawImage(
      img,
      o.x - v.anchor.x / pixelRatio,
      o.y - v.anchor.y / pixelRatio,
      v.width / pixelRatio,
      v.height / pixelRatio
    );
  }
  return true;
}

/* ------------------------------------------------------------ aperçu --- */

/** Épaisseur (m) de la tranche du plancher, comme dans la scène. */
const SLAB_M = 0.2;
const PREVIEW = {
  slabLeft: '#4c3527',
  slabRight: '#3a281d',
  floor: '#6f5442',
  wallLeft: '#cdbfa8',
  wallRight: '#b9a98f',
};

function fillPoly(ctx: Ctx, pts: { x: number; y: number }[], color: string) {
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Caméra qui fait tenir toute la salle (sol, tranche, murs de `wallHeight` m)
 * dans un cadre de cssW × cssH px CSS, avec une marge de `pad` px.
 */
export function fitDecorCamera(
  room: { w: number; d: number },
  wallHeight: number,
  cssW: number,
  cssH: number,
  pad = 8
): Camera {
  const left = gridToScreen(0, room.d).x - TILE_W / 2;
  const right = gridToScreen(room.w, 0).x + TILE_W / 2;
  const top = gridToScreen(0, 0, wallHeight).y;
  const bottom = gridToScreen(room.w, room.d, -SLAB_M).y;
  const zoom = Math.max(
    0.05,
    Math.min(
      (cssW - 2 * pad) / Math.max(1, right - left),
      (cssH - 2 * pad) / Math.max(1, bottom - top)
    )
  );
  return {
    zoom,
    x: cssW / 2 - ((left + right) / 2) * zoom,
    y: cssH / 2 - ((top + bottom) / 2) * zoom,
  };
}

/**
 * Le décor seul (aperçu des réglages), en coordonnées du monde : la caméra
 * est posée par l'appelant. Renvoie true quand sol et murs sont en sprites
 * (false : au moins un aplat d'attente).
 */
export function drawDecorScene(
  ctx: Ctx,
  room: RoomModel,
  decor: ManifestDecor | null,
  pixelRatio: number,
  images: ImageCache,
  patterns: PatternCache
): boolean {
  const { w, d, wallHeight: h } = room;
  const g = (x: number, y: number, z = 0) => gridToScreen(x, y, z);
  fillPoly(
    ctx,
    [g(0, d, -SLAB_M), g(w, d, -SLAB_M), g(w, d), g(0, d)],
    PREVIEW.slabLeft
  );
  fillPoly(
    ctx,
    [g(w, 0, -SLAB_M), g(w, d, -SLAB_M), g(w, d), g(w, 0)],
    PREVIEW.slabRight
  );
  const floor =
    decor !== null &&
    drawFloorSprite(ctx, room, decor, pixelRatio, images, patterns);
  if (!floor)
    fillPoly(ctx, [g(0, 0), g(w, 0), g(w, d), g(0, d)], PREVIEW.floor);
  drawWallShade(ctx, room);
  const walls =
    decor !== null && drawWallSprites(ctx, room, decor, pixelRatio, images);
  if (!walls) {
    fillPoly(ctx, [g(0, 0), g(0, d), g(0, d, h), g(0, 0, h)], PREVIEW.wallLeft);
    fillPoly(
      ctx,
      [g(0, 0), g(w, 0), g(w, 0, h), g(0, 0, h)],
      PREVIEW.wallRight
    );
  }
  return floor && walls;
}
