// Le calque du MODE DÉCO, dessiné par le renderer (lot 4, phase B) :
//   - l'empreinte au sol du meuble « fantôme » (celui qu'on pose ou qu'on
//     déplace), teintée VERT s'il tient là, ROUGE sinon — la validité vient de
//     l'appelant, qui applique les règles de l'API (`placement.ts` : bornes,
//     calques, mur du fond) ;
//   - le contour du meuble SÉLECTIONNÉ (son hexagone projeté, en pointillés),
//     tracé par-dessus tout pour rester visible derrière un autre meuble.
// Le fantôme lui-même est un meuble ordinaire dessiné en transparence, trié en
// profondeur comme les autres (renderer.ts).

import type { Box3 } from './depthSort';
import { gridToScreen } from './projection';
import type { Tile } from './projection';

type Ctx = CanvasRenderingContext2D;

/** Un meuble en cours de placement et sa validité (calculée par l'appelant). */
export type GhostItem = {
  id: string;
  key: string;
  gx: number;
  gy: number;
  r: 0 | 1 | 2 | 3;
  valid: boolean;
};

/** Transparence du sprite fantôme. */
export const GHOST_ALPHA = 0.6;

const VALID_FILL = 'rgba(127, 202, 101, 0.38)';
const VALID_STROKE = 'rgba(160, 230, 130, 0.95)';
const INVALID_FILL = 'rgba(255, 92, 92, 0.42)';
const INVALID_STROKE = 'rgba(255, 140, 140, 0.95)';
const SELECTION_STROKE = 'rgba(255, 214, 120, 0.95)';

/** Losanges au sol des cases couvertes, teintés selon la validité. */
export function drawFootprint(
  ctx: Ctx,
  tiles: readonly Tile[],
  valid: boolean
): void {
  ctx.beginPath();
  for (const t of tiles) {
    const a = gridToScreen(t.i, t.j);
    const b = gridToScreen(t.i + 1, t.j);
    const c = gridToScreen(t.i + 1, t.j + 1);
    const d = gridToScreen(t.i, t.j + 1);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }
  ctx.fillStyle = valid ? VALID_FILL : INVALID_FILL;
  ctx.fill();
  ctx.strokeStyle = valid ? VALID_STROKE : INVALID_STROKE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Les six sommets de la silhouette écran d'une boîte, dans l'ordre. */
export function boxOutline(box: Box3): Array<{ x: number; y: number }> {
  return [
    gridToScreen(box.minX, box.minY, box.maxZ),
    gridToScreen(box.maxX, box.minY, box.maxZ),
    gridToScreen(box.maxX, box.minY, box.minZ),
    gridToScreen(box.maxX, box.maxY, box.minZ),
    gridToScreen(box.minX, box.maxY, box.minZ),
    gridToScreen(box.minX, box.maxY, box.maxZ),
  ];
}

/** Contour en pointillés du meuble sélectionné. */
export function drawSelection(ctx: Ctx, box: Box3): void {
  const pts = boxOutline(box);
  ctx.save();
  ctx.beginPath();
  pts.forEach((p, k) =>
    k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
  );
  ctx.closePath();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = SELECTION_STROKE;
  ctx.stroke();
  ctx.restore();
}
