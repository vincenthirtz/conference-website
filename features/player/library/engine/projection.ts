// Projection de la Women's Library — CONTRAT partagé avec le pipeline de
// sprites (Blender, rendu hors ligne). Ne pas changer une constante ici sans
// re-rendre tous les sprites.
//
// Caméra orthographique, azimut 45°, élévation 30° (dimétrie « 2:1 ») :
//   - 1 case = METERS_PER_TILE × METERS_PER_TILE = 0,5 m × 0,5 m. gx croît
//     vers le bas-droite de l'écran, gy vers le bas-gauche (en CASES), z vers
//     le haut (en MÈTRES) ;
//   - la diagonale d'une case (0,5 × √2 m) occupe TILE_W px CSS à
//     l'horizontale : PX_PER_METER = TILE_W / (√2 × 0,5) ≈ 90.51 px par mètre
//     dans le plan de l'écran ;
//   - le sol est raccourci de sin(30°) = 1/2, d'où le losange TILE_W × TILE_H
//     (64 × 32) ;
//   - un mètre VERTICAL se projette en cos(30°) × PX_PER_METER ≈ 78.38 px.
//
// Unités : empreintes et positions en cases, hauteurs (manifeste, boîtes,
// avatars) en mètres. La seule conversion mètres → px verticaux est Z_PX,
// dans gridToScreen ; metersToTiles sert aux longueurs au sol.
//
// Grille → écran (px CSS, avant caméra) :
//   sx = (gx − gy) × TILE_W/2,  sy = (gx + gy) × TILE_H/2 − z × Z_PX.
// Le sommet haut du losange de la case (i, j) est gridToScreen(i, j).

export const TILE_W = 64;
export const TILE_H = 32;
export const METERS_PER_TILE = 0.5;
export const CAMERA_ELEVATION_RAD = Math.PI / 6;
export const PX_PER_METER = TILE_W / (Math.SQRT2 * METERS_PER_TILE);
export const Z_PX = Math.cos(CAMERA_ELEVATION_RAD) * PX_PER_METER;

/** Longueur au sol : mètres → cases. */
export function metersToTiles(m: number): number {
  return m / METERS_PER_TILE;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;

export type ScreenPoint = { x: number; y: number };
export type GridPoint = { gx: number; gy: number };
export type Tile = { i: number; j: number };

/**
 * Caméra : `x`, `y` = position, en px CSS du canvas, de l'origine du monde
 * (sommet haut de la case 0,0 au sol) ; `zoom` multiplie les px du monde.
 */
export type Camera = { x: number; y: number; zoom: number };

export function gridToScreen(gx: number, gy: number, z = 0): ScreenPoint {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2) - z * Z_PX,
  };
}

/** Inverse au sol (z = 0) : point écran du monde → coordonnées grille. */
export function screenToGrid(sx: number, sy: number): GridPoint {
  const a = sx / (TILE_W / 2); // gx − gy
  const b = sy / (TILE_H / 2); // gx + gy
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

export function worldToCanvas(p: ScreenPoint, cam: Camera): ScreenPoint {
  return { x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y };
}

export function canvasToWorld(p: ScreenPoint, cam: Camera): ScreenPoint {
  return { x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom };
}

/**
 * Case du SOL sous un point du canvas (px CSS), ou null hors de la salle.
 * Un point exactement sur une arête appartient à la case d'indice supérieur
 * (Math.floor), comme une case [i, i+1[ × [j, j+1[.
 */
export function pickTile(
  canvasX: number,
  canvasY: number,
  cam: Camera,
  room: { w: number; d: number }
): Tile | null {
  const world = canvasToWorld({ x: canvasX, y: canvasY }, cam);
  const { gx, gy } = screenToGrid(world.x, world.y);
  // Tolérance numérique : 2.9999999 doit rester dans la case 2, 3.0000000001
  // dans la case 3 — on arrondit à 1e-9 avant le floor.
  const i = Math.floor(Math.round(gx * 1e9) / 1e9);
  const j = Math.floor(Math.round(gy * 1e9) / 1e9);
  if (i < 0 || j < 0 || i >= room.w || j >= room.d) return null;
  return { i, j };
}

/** Un point sur l'un des deux murs du fond. */
export type WallHit = {
  /** `right` : plan gy = 0 (le long de gx) ; `left` : plan gx = 0 (le long de gy). */
  side: 'left' | 'right';
  /** Case du mur sous le point : indice gx (mur droit) ou gy (mur gauche). */
  at: number;
  /** Hauteur du point sur le mur, en mètres. */
  z: number;
};

/**
 * Point d'un MUR DU FOND sous un point du canvas (px CSS), ou null. Sert à
 * viser un meuble mural (cadre, miroir) : le pointeur est sur le mur, au-dessus
 * du sol, là où `pickTile` ne trouve aucune case. Mur droit : gy = 0, donc
 * sx = gx·TILE_W/2 et sy = gx·TILE_H/2 − z·Z_PX ; mur gauche : gx = 0, donc
 * sx = −gy·TILE_W/2. Les deux plans ne se partagent que l'arête du coin.
 */
export function pickWall(
  canvasX: number,
  canvasY: number,
  cam: Camera,
  room: { w: number; d: number },
  wallHeight: number
): WallHit | null {
  const p = canvasToWorld({ x: canvasX, y: canvasY }, cam);
  const along = (n: number) => Math.round(n * 1e9) / 1e9;
  const gx = along(p.x / (TILE_W / 2));
  if (gx >= 0) {
    const z = (gx * (TILE_H / 2) - p.y) / Z_PX;
    if (gx < room.w && z >= 0 && z <= wallHeight)
      return { side: 'right', at: Math.floor(gx), z };
    return null;
  }
  const gy = -gx;
  const z = (gy * (TILE_H / 2) - p.y) / Z_PX;
  if (gy < room.d && z >= 0 && z <= wallHeight)
    return { side: 'left', at: Math.floor(gy), z };
  return null;
}

/** La case au pied du mur visé (celle où se pose un meuble mural). */
export function wallFootTile(hit: WallHit): Tile {
  return hit.side === 'right' ? { i: hit.at, j: 0 } : { i: 0, j: hit.at };
}

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Zoome d'un facteur en gardant fixe le point du canvas (ax, ay). */
export function zoomAt(
  cam: Camera,
  ax: number,
  ay: number,
  factor: number
): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  const k = zoom / cam.zoom;
  return { zoom, x: ax - (ax - cam.x) * k, y: ay - (ay - cam.y) * k };
}

/**
 * Caméra qui centre la salle (sol + murs de `wallHeight` m) dans un canvas
 * de cssW × cssH px CSS.
 */
export function centerCamera(
  room: { w: number; d: number },
  wallHeight: number,
  cssW: number,
  cssH: number,
  zoom = 1
): Camera {
  const left = gridToScreen(0, room.d).x;
  const right = gridToScreen(room.w, 0).x;
  const top = gridToScreen(0, 0, wallHeight).y;
  const bottom = gridToScreen(room.w, room.d).y;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  return { zoom, x: cssW / 2 - cx * zoom, y: cssH / 2 - cy * zoom };
}
