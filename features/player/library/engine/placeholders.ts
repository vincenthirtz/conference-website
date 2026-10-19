// Dessins de remplacement, en attendant (ou à défaut de) sprites pré-rendus :
// boîtes isométriques ombrées pour les meubles, silhouette simple pour les
// avatars, et l'ombre au sol de TOUS les avatars (elle n'est pas cuite dans
// les sprites). Tout est tracé en px du MONDE : le renderer a déjà posé la
// transformation caméra × devicePixelRatio sur le contexte.
//
// Les cotes sont en mètres : au sol, converties en cases (metersToTiles) ;
// en hauteur, passées telles quelles à gridToScreen (z en mètres).
//
// Lumière fixe venant de la gauche : face +y (bas-gauche) claire, face +x
// (bas-droite) sombre, dessus le plus clair.

import type { Box3 } from './depthSort';
import type { Direction } from './motion';
import { gridToScreen, metersToTiles, PX_PER_METER, Z_PX } from './projection';
import type { Rotation } from './room';
import { AVATAR_HEIGHT } from './room';

type Ctx = CanvasRenderingContext2D;

export type BoxColors = {
  top: string;
  left: string;
  right: string;
  edge: string;
};

/** Mètres au sol → cases. */
const m = metersToTiles;

function poly(
  ctx: Ctx,
  pts: ReadonlyArray<readonly [number, number, number]>
): void {
  ctx.beginPath();
  pts.forEach(([x, y, z], k) => {
    const p = gridToScreen(x, y, z);
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

/** Boîte pleine : faces +y, +x puis dessus (seules visibles de la caméra). */
export function drawBox(ctx: Ctx, b: Box3, c: BoxColors): void {
  const { minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 } = b;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c.edge;
  poly(ctx, [
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1],
  ]);
  ctx.fillStyle = c.left;
  ctx.fill();
  ctx.stroke();
  poly(ctx, [
    [x1, y0, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x1, y0, z1],
  ]);
  ctx.fillStyle = c.right;
  ctx.fill();
  ctx.stroke();
  poly(ctx, [
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ]);
  ctx.fillStyle = c.top;
  ctx.fill();
  ctx.stroke();
}

const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsla(${h}, ${s}%, ${l}%, ${a})`;

/** Trois tons d'une même teinte pour une boîte. */
export function shades(h: number, s: number, l: number): BoxColors {
  return {
    top: hsl(h, s, l + 12),
    left: hsl(h, s, l),
    right: hsl(h, s, l - 12),
    edge: hsl(h, s, Math.max(0, l - 28), 0.9),
  };
}

const WOOD = shades(28, 42, 34);
const BOOKS = [shades(352, 45, 38), shades(150, 30, 32), shades(212, 35, 38)];
const FABRIC = shades(170, 38, 36);
const BRASS = shades(42, 55, 45);
const SHADE = shades(48, 70, 70);
const OAK = shades(32, 45, 46);
const UNKNOWN = shades(270, 15, 45);

const sub = (b: Box3, p: Partial<Box3>): Box3 => ({ ...b, ...p });

/** Rayonnage : caisson bois, rangées de livres sur les faces visibles. */
function bookshelf(ctx: Ctx, b: Box3): void {
  drawBox(ctx, b, WOOD);
  const rows = 5;
  const inset = m(0.05);
  const h = b.maxZ - b.minZ;
  for (let k = 0; k < rows; k++) {
    const z0 = b.minZ + 0.1 + (k * (h - 0.15)) / rows;
    const z1 = z0 + (h - 0.15) / rows - 0.08;
    const books = BOOKS[k % BOOKS.length];
    ctx.fillStyle = books.left;
    poly(ctx, [
      [b.minX + inset, b.maxY, z0],
      [b.maxX - inset, b.maxY, z0],
      [b.maxX - inset, b.maxY, z1],
      [b.minX + inset, b.maxY, z1],
    ]);
    ctx.fill();
    ctx.fillStyle = books.right;
    poly(ctx, [
      [b.maxX, b.minY + inset, z0],
      [b.maxX, b.maxY - inset, z0],
      [b.maxX, b.maxY - inset, z1],
      [b.maxX, b.minY + inset, z1],
    ]);
    ctx.fill();
  }
}

/** Fauteuil : assise + dossier, le dossier du côté opposé à la rotation. */
function armchair(ctx: Ctx, b: Box3, r: Rotation): void {
  const t = m(0.2);
  // Dossier et assise se partagent l'empreinte sans se chevaucher : un plan
  // les sépare, l'ordre de dessin s'en déduit.
  const backs: Record<Rotation, [Partial<Box3>, Partial<Box3>]> = {
    0: [{ maxY: b.minY + t }, { minY: b.minY + t }],
    1: [{ minX: b.maxX - t }, { maxX: b.maxX - t }],
    2: [{ minY: b.maxY - t }, { maxY: b.maxY - t }],
    3: [{ maxX: b.minX + t }, { minX: b.minX + t }],
  };
  const back = sub(b, backs[r][0]);
  const seat = sub(b, { ...backs[r][1], maxZ: 0.45 });
  // Dossier au fond (côté −x ou −y) : dessiné avant l'assise, sinon après.
  const backFirst = r === 0 || r === 3;
  if (backFirst) drawBox(ctx, back, FABRIC);
  drawBox(ctx, seat, FABRIC);
  if (!backFirst) drawBox(ctx, back, FABRIC);
}

/** Lampe sur pied : socle, tige, abat-jour (rayons en mètres). */
function lamp(ctx: Ctx, b: Box3): void {
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const around = (rm: number, z0: number, z1: number): Box3 => ({
    minX: cx - m(rm),
    maxX: cx + m(rm),
    minY: cy - m(rm),
    maxY: cy + m(rm),
    minZ: z0,
    maxZ: z1,
  });
  const top = b.maxZ;
  drawBox(ctx, around(0.14, 0, 0.04), BRASS);
  drawBox(ctx, around(0.02, 0.04, top - 0.3), BRASS);
  drawBox(ctx, around(0.18, top - 0.34, top), SHADE);
}

/** Table : quatre pieds puis plateau (au-dessus de tout le reste). */
function table(ctx: Ctx, b: Box3): void {
  const leg = m(0.06);
  const inset = m(0.06);
  const top = b.maxZ - 0.05;
  const corners = [
    { x: b.minX + inset, y: b.minY + inset },
    { x: b.maxX - inset - leg, y: b.minY + inset },
    { x: b.minX + inset, y: b.maxY - inset - leg },
    { x: b.maxX - inset - leg, y: b.maxY - inset - leg },
  ];
  for (const c of corners)
    drawBox(
      ctx,
      {
        minX: c.x,
        maxX: c.x + leg,
        minY: c.y,
        maxY: c.y + leg,
        minZ: 0,
        maxZ: top,
      },
      OAK
    );
  drawBox(ctx, sub(b, { minZ: top }), OAK);
}

export function drawFurniturePlaceholder(
  ctx: Ctx,
  key: string,
  box: Box3,
  r: Rotation
): void {
  if (key === 'bookshelf') bookshelf(ctx, box);
  else if (key === 'armchair') armchair(ctx, box, r);
  else if (key === 'lamp') lamp(ctx, box);
  else if (key === 'table') table(ctx, box);
  else drawBox(ctx, box, UNKNOWN);
}

/** Rayon de l'ombre au sol d'un avatar (≈ une demi-case). */
export const AVATAR_SHADOW_RADIUS_M = 0.24;

/**
 * Ombre douce au sol (ellipse floue) sous un avatar, sprite ou silhouette ;
 * anneau doré en plus sous la joueuse.
 */
export function drawAvatarShadow(
  ctx: Ctx,
  x: number,
  y: number,
  highlight: boolean
): void {
  const foot = gridToScreen(x, y, 0);
  const r = AVATAR_SHADOW_RADIUS_M * PX_PER_METER;
  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
  g.addColorStop(0.6, 'rgba(0, 0, 0, 0.2)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  if (highlight) {
    ctx.strokeStyle = 'rgba(255, 214, 120, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

const SKIN = ['#f1c9a5', '#d9a07a', '#a8714f', '#7a4b33', '#5a3825'];

export type AvatarLook = {
  hue: number;
  dir: Direction;
  walking: boolean;
  /** Phase de pas (distance parcourue) pour balancer les jambes. */
  phase: number;
};

/** Silhouette d'environ 1,65 m posée en (x, y) — sans ombre (cf. ci-dessus). */
export function drawAvatarPlaceholder(
  ctx: Ctx,
  x: number,
  y: number,
  look: AvatarLook
): void {
  const foot = gridToScreen(x, y, 0);
  const zm = Z_PX; // px par mètre vertical
  const hm = PX_PER_METER; // px par mètre horizontal (plan de l'écran)
  const swing = look.walking ? Math.sin(look.phase) * 0.06 * zm : 0;
  const bob = look.walking ? Math.abs(Math.cos(look.phase)) * 0.02 * zm : 0;
  const legH = 0.8 * zm;
  const legW = 0.1 * hm;
  const gap = 0.025 * hm;
  ctx.fillStyle = hsl(look.hue, 25, 22);
  ctx.fillRect(
    foot.x - gap - legW,
    foot.y - legH - bob + swing,
    legW,
    legH - swing
  );
  ctx.fillRect(foot.x + gap, foot.y - legH - bob - swing, legW, legH + swing);

  // Buste : dégradé horizontal de la teinte de la tenue.
  const torsoW = 0.4 * hm;
  const torsoTop = foot.y - 1.42 * zm - bob;
  const torsoBottom = foot.y - 0.74 * zm - bob;
  const grad = ctx.createLinearGradient(
    foot.x - torsoW / 2,
    0,
    foot.x + torsoW / 2,
    0
  );
  grad.addColorStop(0, hsl(look.hue, 55, 62));
  grad.addColorStop(1, hsl(look.hue, 55, 40));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(
    foot.x - torsoW / 2,
    torsoTop,
    torsoW,
    torsoBottom - torsoTop,
    0.06 * hm
  );
  ctx.fill();

  // Tête et visage (ou cheveux si elle tourne le dos : directions 7, 0, 1).
  const headR = 0.11 * hm;
  const headY = foot.y - (AVATAR_HEIGHT - 0.11) * zm - bob;
  const skin = SKIN[Math.abs(Math.floor(look.hue / 37)) % SKIN.length];
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(foot.x, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  const angle = (look.dir * Math.PI) / 4;
  const away = look.dir === 7 || look.dir === 0 || look.dir === 1;
  ctx.fillStyle = hsl((look.hue + 180) % 360, 35, 18);
  ctx.beginPath();
  if (away) ctx.arc(foot.x, headY - 1, headR * 1.05, 0, Math.PI * 2);
  else
    ctx.arc(
      foot.x,
      headY - headR * 0.2,
      headR * 1.05,
      Math.PI * 1.05,
      Math.PI * 1.95
    );
  ctx.fill();
  if (!away) {
    const ex = foot.x + Math.sin(angle) * headR * 0.45;
    const eye = headR * 0.16;
    const spread = Math.abs(Math.cos(angle)) * headR * 0.38 + eye;
    ctx.fillStyle = '#2a1d22';
    ctx.fillRect(ex - spread - eye / 2, headY, eye, eye * 1.2);
    ctx.fillRect(ex + spread - eye / 2, headY, eye, eye * 1.2);
  }
}
