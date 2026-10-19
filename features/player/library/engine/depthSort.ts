// Ordre du peintre pour des boîtes 3D alignées sur les axes (meubles :
// empreinte × hauteur ; avatars : petite boîte), du fond vers l'avant.
//
// Trier sur gx + gy (de l'origine ou du centre) se trompe dès qu'un meuble
// couvre plusieurs cases : un rayonnage 2×1 dont l'origine est « derrière »
// un avatar peut pourtant le cacher. On fait donc comme les jeux
// isométriques classiques :
//   1. deux boîtes ne sont ordonnées que si leurs projections à l'écran se
//      chevauchent (hexagones : test sur leurs trois axes de bord) ;
//   2. si elles se chevauchent, un plan perpendiculaire à x, y ou z les
//      sépare ; la boîte du côté de la caméra (+x, +y, +z) passe devant ;
//   3. tri topologique de ces contraintes (Kahn), les ex aequo départagés par
//      la profondeur du centre pour un ordre stable. Un cycle (boîtes qui
//      s'interpénètrent, ex. deux avatars au même endroit) est rompu en
//      prenant la boîte la plus au fond.
// O(n²) sur les paires : prévu pour ≤ ~150 objets par salle.

import { TILE_H, TILE_W, Z_PX } from './projection';

export type Box3 = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const EPS = 1e-6;
/** Pente des arêtes verticales dans les axes de bord de l'hexagone. */
const K = Z_PX / TILE_H;

/**
 * Les projections écran de a et b se recouvrent-elles (plus qu'un contact) ?
 * Les bords d'un hexagone de boîte suivent les trois axes projetés ; leurs
 * normales donnent trois intervalles : u = x − y (horizontale écran),
 * x − K·z et y − K·z.
 */
export function screenOverlap(a: Box3, b: Box3): boolean {
  const overlap = (a0: number, a1: number, b0: number, b1: number) =>
    a0 < b1 - EPS && b0 < a1 - EPS;
  return (
    overlap(
      a.minX - a.maxY,
      a.maxX - a.minY,
      b.minX - b.maxY,
      b.maxX - b.minY
    ) &&
    overlap(
      a.minX - K * a.maxZ,
      a.maxX - K * a.minZ,
      b.minX - K * b.maxZ,
      b.maxX - K * b.minZ
    ) &&
    overlap(
      a.minY - K * a.maxZ,
      a.maxY - K * a.minZ,
      b.minY - K * b.maxZ,
      b.maxY - K * b.minZ
    )
  );
}

/**
 * Un point de l'écran (px du MONDE, avant caméra) tombe-t-il dans la
 * projection de la boîte ? Même découpage que `screenOverlap` : le point donne
 * a = x − y et b = x + y − 2K·z (gridToScreen inversé), d'où u = a,
 * v = (a + b)/2 = x − K·z et w = (b − a)/2 = y − K·z, à comparer aux trois
 * intervalles de l'hexagone. Sert à viser un meuble par son image (un
 * rayonnage se clique sur ses étagères, pas seulement à sa base).
 */
export function boxContainsScreenPoint(
  box: Box3,
  sx: number,
  sy: number
): boolean {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  const u = a;
  const v = (a + b) / 2;
  const w = (b - a) / 2;
  const within = (n: number, lo: number, hi: number) =>
    n >= lo - EPS && n <= hi + EPS;
  return (
    within(u, box.minX - box.maxY, box.maxX - box.minY) &&
    within(v, box.minX - K * box.maxZ, box.maxX - K * box.minZ) &&
    within(w, box.minY - K * box.maxZ, box.maxY - K * box.minZ)
  );
}

/** Profondeur du centre : plus grand = plus près de la caméra. */
export function centerDepth(b: Box3): number {
  return (b.minX + b.maxX + b.minY + b.maxY + b.minZ + b.maxZ) / 2;
}

/**
 * 1 si a passe devant b, −1 si derrière, 0 si leurs projections ne se
 * recouvrent pas (aucune contrainte).
 */
export function compareBoxes(a: Box3, b: Box3): -1 | 0 | 1 {
  if (!screenOverlap(a, b)) return 0;
  if (a.minX >= b.maxX - EPS) return 1;
  if (b.minX >= a.maxX - EPS) return -1;
  if (a.minY >= b.maxY - EPS) return 1;
  if (b.minY >= a.maxY - EPS) return -1;
  if (a.minZ >= b.maxZ - EPS) return 1;
  if (b.minZ >= a.maxZ - EPS) return -1;
  // Interpénétration : aucun plan ne sépare, on prend le centre.
  const da = centerDepth(a);
  const db = centerDepth(b);
  if (da === db) return 0;
  return da > db ? 1 : -1;
}

/** Trie du fond vers l'avant (ordre de dessin). Ne modifie pas l'entrée. */
export function depthSort<T extends { box: Box3 }>(items: readonly T[]): T[] {
  const n = items.length;
  if (n < 2) return items.slice();
  // after[k] : objets à dessiner APRÈS k (devant lui) ; indeg = nombre
  // d'objets à dessiner avant.
  const after: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const c = compareBoxes(items[a].box, items[b].box);
      if (c === 1) {
        after[b].push(a);
        indeg[a]++;
      } else if (c === -1) {
        after[a].push(b);
        indeg[b]++;
      }
    }
  }
  const depth = items.map((it) => centerDepth(it.box));
  const done = new Uint8Array(n);
  const out: T[] = [];
  while (out.length < n) {
    // Parmi les prêtes (degré 0), la plus au fond ; sinon (cycle) la plus au
    // fond de toutes les restantes. n ≤ ~150 : la sélection linéaire suffit.
    let pick = -1;
    let fallback = -1;
    for (let k = 0; k < n; k++) {
      if (done[k]) continue;
      if (fallback === -1 || depth[k] < depth[fallback]) fallback = k;
      if (indeg[k] === 0 && (pick === -1 || depth[k] < depth[pick])) pick = k;
    }
    if (pick === -1) pick = fallback;
    done[pick] = 1;
    out.push(items[pick]);
    for (const next of after[pick]) indeg[next]--;
  }
  return out;
}
