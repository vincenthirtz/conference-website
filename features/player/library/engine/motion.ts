// Marche d'un avatar le long d'un chemin de cases, à vitesse constante.
//
// Position continue en coordonnées grille : le centre de la case (i, j) est
// (i + 0.5, j + 0.5). La vitesse est en CASES par seconde (1 case = 0,5 m),
// mesurée le long du trajet : un pas diagonal (√2) prend √2 fois plus de
// temps. Les vitesses se pensent en m/s et se convertissent ici.
//
// ORIENTATION — 8 directions ÉCRAN, numérotées dans le sens horaire à partir
// du haut de l'écran (c'est l'ordre des feuilles de sprites) :
//
//   index  écran            déplacement grille (dgx, dgy)
//   0      N  (haut)        (−1, −1)
//   1      NE (haut-droite) ( 0, −1)
//   2      E  (droite)      (+1, −1)
//   3      SE (bas-droite)  (+1,  0)
//   4      S  (bas)         (+1, +1)
//   5      SO (bas-gauche)  ( 0, +1)
//   6      O  (gauche)      (−1, +1)
//   7      NO (haut-gauche) (−1,  0)
//
// Le miroir horizontal (axe vertical de l'écran) envoie d sur (8 − d) mod 8 :
// on rend 0 à 4 et on obtient 5, 6, 7 en miroir de 3, 2, 1.

import { metersToTiles, TILE_H, TILE_W, type Tile } from './projection';

export type Direction = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Walker = {
  x: number;
  y: number;
  dir: Direction;
  /** Cases restant à atteindre (la première est la cible courante). */
  path: Tile[];
  /** Cases par seconde (DEFAULT_WALK_SPEED = 1,3 m/s). */
  speed: number;
  /** Distance totale parcourue (CASES) : phase de l'animation de marche. */
  travelled: number;
};

/** Marche nominale d'un avatar : 1,3 m/s. */
export const WALK_SPEED_MPS = 1.3;
/** La même, en cases par seconde (2,6). */
export const DEFAULT_WALK_SPEED = metersToTiles(WALK_SPEED_MPS);

export function tileCenter(t: Tile): { x: number; y: number } {
  return { x: t.i + 0.5, y: t.j + 0.5 };
}

/**
 * Direction écran (0..7) d'un déplacement grille (dx, dy), ou null s'il est
 * nul. On passe par le vecteur À L'ÉCRAN : c'est lui que voit la joueuse.
 */
export function directionFromDelta(dx: number, dy: number): Direction | null {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  const sx = (dx - dy) * (TILE_W / 2);
  const sy = (dx + dy) * (TILE_H / 2);
  // Angle depuis le haut de l'écran, sens horaire (y écran vers le bas).
  const angle = Math.atan2(sx, -sy);
  const idx = Math.round(angle / (Math.PI / 4));
  return (((idx % 8) + 8) % 8) as Direction;
}

export function mirrorDirection(d: Direction): Direction {
  return ((8 - d) % 8) as Direction;
}

/** Sprite à utiliser : direction rendue (0..4) et miroir éventuel. */
export function spriteDirection(d: Direction): {
  base: 0 | 1 | 2 | 3 | 4;
  mirrored: boolean;
} {
  return d <= 4
    ? { base: d as 0 | 1 | 2 | 3 | 4, mirrored: false }
    : { base: mirrorDirection(d) as 1 | 2 | 3, mirrored: true };
}

export function createWalker(
  tile: Tile,
  speed = DEFAULT_WALK_SPEED,
  dir: Direction = 4
): Walker {
  const c = tileCenter(tile);
  return { x: c.x, y: c.y, dir, path: [], speed, travelled: 0 };
}

export function isWalking(w: Walker): boolean {
  return w.path.length > 0;
}

/** Case occupée (celle sous les pieds). */
export function walkerTile(w: Walker): Tile {
  return { i: Math.floor(w.x), j: Math.floor(w.y) };
}

/**
 * Case d'où repartir pour un nouveau trajet : la cible courante si l'avatar
 * marche (il finit son pas, il ne fait pas demi-tour au milieu d'une case),
 * sinon sa case.
 */
export function headingTile(w: Walker): Tile {
  return w.path.length ? { ...w.path[0] } : walkerTile(w);
}

/**
 * Remplace le trajet. `path` vient de findPath (départ compris) : les cases
 * déjà atteintes en tête (le centre où se trouve l'avatar) sont retirées.
 */
export function setWalkerPath(w: Walker, path: Tile[]): void {
  const next = path.map((t) => ({ i: t.i, j: t.j }));
  while (next.length) {
    const c = tileCenter(next[0]);
    if (Math.abs(c.x - w.x) > 1e-9 || Math.abs(c.y - w.y) > 1e-9) break;
    next.shift();
  }
  w.path = next;
}

/** Avance de dt secondes. Renvoie true si l'avatar a bougé. */
export function advanceWalker(w: Walker, dt: number): boolean {
  if (!w.path.length || dt <= 0) return false;
  let budget = w.speed * dt;
  let moved = false;
  while (budget > 0 && w.path.length) {
    const target = tileCenter(w.path[0]);
    const dx = target.x - w.x;
    const dy = target.y - w.y;
    const dist = Math.hypot(dx, dy);
    const dir = directionFromDelta(dx, dy);
    if (dir !== null) w.dir = dir;
    if (dist <= budget) {
      w.x = target.x;
      w.y = target.y;
      w.travelled += dist;
      budget -= dist;
      w.path.shift();
    } else {
      w.x += (dx / dist) * budget;
      w.y += (dy / dist) * budget;
      w.travelled += budget;
      budget = 0;
    }
    moved = true;
  }
  return moved;
}
