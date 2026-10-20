// Décor fixe d'une salle : sol en motif et segments des deux murs du fond
// (section `decor` du manifeste, rendue par tools/library-assets/render_decor.py).
//
// SOL — un sprite de sol est UNE cellule du réseau périodique de son motif :
// la texture boucle sur `periodTiles` cases (N) dans les deux axes, donc son
// image écran boucle sur (N·TILE_W, N·TILE_H) px CSS. L'image fait
// (N·TILE_W, N·TILE_H) × pixelRatio px, l'ancre est le sommet haut de la
// case (0, 0), au milieu du bord haut. Le moteur la pose en motif répété
// (createPattern) sur tout le losange de la salle : une seule opération de
// remplissage, sans joint.
//
// MURS — un style de mur donne, pour chaque côté (`left` : le long de gy, plan
// gx = 0 ; `right` : le long de gx, plan gy = 0), des variantes posées par
// leur ancre :
//   - `plain` (span 1, obligatoire), `window`, `door`, `bookshelf`… couvrent
//     `span` cases à partir de leur origine : (at, 0) à droite, (0, at) à
//     gauche ;
//   - `end` (span 0, facultatif) est la tranche du bout du mur, posée en
//     (w, 0) à droite et (0, d) à gauche.
// Les bandes débordent de 2 px d'image de chaque côté sur leurs voisines, avec
// un contenu identique : pas de joint d'anticrénelage entre deux segments.
//
// La salle choisit son sol, son style et ses variantes (RoomDecor) ; une case
// de mur sans variante est `plain`. Une variante inconnue, qui déborde ou en
// chevauche une autre est ignorée (case simple) et signalée par wallIssues.
//
// Lot 12 : un appartement prend pour style son habillage de murs (`finish`)
// et pour variantes ses fenêtres (`window`, `window_<style>`) et sa porte
// (`door`, `door_<style>`), aux places de `apartmentOpenings`
// (config/library/decor.ts). Fenêtres et portes sont dans l'ÉPAISSEUR du mur
// (derrière gx = 0 / gy = 0) : aucune case du sol n'est prise, la pose des
// meubles ne change pas.

import { TILE_H, TILE_W } from './projection';

export type DecorFrame = {
  src: string;
  width: number;
  height: number;
  anchor: { x: number; y: number };
};

export type FloorSprite = DecorFrame & { periodTiles: number };

export type WallVariant = DecorFrame & { span: number };

export type WallSide = 'left' | 'right';

export type WallStyle = {
  /** Mètres. */
  height: number;
  /** Mètres, derrière le plan du mur. */
  thickness: number;
  left: Record<string, WallVariant>;
  right: Record<string, WallVariant>;
};

export type ManifestDecor = {
  floors: Record<string, FloorSprite>;
  walls: Record<string, WallStyle>;
};

/** Une variante posée sur un mur, à partir de la case `at`. */
export type WallSlot = { at: number; variant: string };

export type RoomDecor = {
  floor?: string;
  wallStyle?: string;
  /** Mur gauche (le long de gy) ; `at` = indice gy. */
  left?: WallSlot[];
  /** Mur droit (le long de gx) ; `at` = indice gx. */
  right?: WallSlot[];
};

export type WallSegment = { at: number; span: number; variant: string };

export const EMPTY_DECOR: ManifestDecor = { floors: {}, walls: {} };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number): v is number =>
  isNum(v) && Number.isInteger(v) && v >= min;

function parseFrame(v: unknown): DecorFrame | null {
  if (!isObj(v) || typeof v.src !== 'string' || !v.src) return null;
  if (!isNum(v.width) || !isNum(v.height) || v.width <= 0 || v.height <= 0)
    return null;
  if (!isObj(v.anchor) || !isNum(v.anchor.x) || !isNum(v.anchor.y)) return null;
  return {
    src: v.src,
    width: v.width,
    height: v.height,
    anchor: { x: v.anchor.x, y: v.anchor.y },
  };
}

/**
 * Un sol n'est utilisable que si son image est exactement une cellule du
 * réseau (sinon le motif se décalerait d'une rangée à l'autre).
 */
function parseFloor(v: unknown, pixelRatio: number): FloorSprite | null {
  const frame = parseFrame(v);
  if (!frame || !isObj(v) || !isInt(v.periodTiles, 1)) return null;
  const n = v.periodTiles;
  if (frame.width !== n * TILE_W * pixelRatio) return null;
  if (frame.height !== n * TILE_H * pixelRatio) return null;
  if (frame.anchor.x !== frame.width / 2 || frame.anchor.y !== 0) return null;
  return { ...frame, periodTiles: n };
}

function parseSide(v: unknown): Record<string, WallVariant> | null {
  if (!isObj(v)) return null;
  const out: Record<string, WallVariant> = {};
  for (const [name, raw] of Object.entries(v)) {
    const frame = parseFrame(raw);
    if (!frame || !isObj(raw) || !isInt(raw.span, 0)) continue;
    // Seule la tranche de bout de mur a une largeur nulle.
    if ((raw.span === 0) !== (name === 'end')) continue;
    out[name] = { ...frame, span: raw.span };
  }
  return out.plain?.span === 1 ? out : null;
}

function parseWallStyle(v: unknown): WallStyle | null {
  if (!isObj(v) || !isNum(v.height) || v.height <= 0) return null;
  if (!isNum(v.thickness) || v.thickness < 0) return null;
  const left = parseSide(v.left);
  const right = parseSide(v.right);
  if (!left || !right) return null;
  return { height: v.height, thickness: v.thickness, left, right };
}

/**
 * Section `decor` du manifeste ; absente ou illisible = aucun décor (le moteur
 * garde son sol et ses murs procéduraux). Une entrée mal formée est ignorée.
 */
export function parseDecor(v: unknown, pixelRatio: number): ManifestDecor {
  if (!isObj(v)) return { floors: {}, walls: {} };
  const floors: Record<string, FloorSprite> = {};
  if (isObj(v.floors)) {
    for (const [key, raw] of Object.entries(v.floors)) {
      const f = parseFloor(raw, pixelRatio);
      if (f) floors[key] = f;
    }
  }
  const walls: Record<string, WallStyle> = {};
  if (isObj(v.walls)) {
    for (const [key, raw] of Object.entries(v.walls)) {
      const w = parseWallStyle(raw);
      if (w) walls[key] = w;
    }
  }
  return { floors, walls };
}

/**
 * Découpe un mur de `length` cases en segments : les variantes demandées là
 * où elles tiennent, des cases `plain` partout ailleurs. `spanOf` donne la
 * largeur d'une variante (null = inconnue du style).
 */
export function layoutWall(
  length: number,
  slots: readonly WallSlot[],
  spanOf: (variant: string) => number | null
): { segments: WallSegment[]; issues: string[] } {
  const issues: string[] = [];
  const start = new Map<number, WallSegment>();
  const taken = new Uint8Array(Math.max(0, length));
  const sorted = [...slots].sort((a, b) => a.at - b.at);
  for (const slot of sorted) {
    const span = spanOf(slot.variant);
    const label = `${slot.variant}@${slot.at}`;
    if (span === null || span < 1) {
      issues.push(`${label}: unknown variant`);
      continue;
    }
    if (!Number.isInteger(slot.at) || slot.at < 0 || slot.at + span > length) {
      issues.push(`${label}: out of wall`);
      continue;
    }
    let free = true;
    for (let k = slot.at; k < slot.at + span; k++) if (taken[k]) free = false;
    if (!free) {
      issues.push(`${label}: overlaps`);
      continue;
    }
    for (let k = slot.at; k < slot.at + span; k++) taken[k] = 1;
    start.set(slot.at, { at: slot.at, span, variant: slot.variant });
  }
  const segments: WallSegment[] = [];
  for (let i = 0; i < length; ) {
    const seg = start.get(i);
    if (seg) {
      segments.push(seg);
      i += seg.span;
    } else {
      segments.push({ at: i, span: 1, variant: 'plain' });
      i += 1;
    }
  }
  return { segments, issues };
}

/** Origine grille (gx, gy) d'un segment ; `end` : bout du mur. */
export function segmentOrigin(
  side: WallSide,
  at: number
): { gx: number; gy: number } {
  return side === 'right' ? { gx: at, gy: 0 } : { gx: 0, gy: at };
}

/** Les deux murs d'une salle avec un style donné (segments + problèmes). */
export function roomWalls(
  room: { w: number; d: number; decor?: RoomDecor },
  style: WallStyle
): Record<WallSide, WallSegment[]> & { issues: string[] } {
  const spanOf = (side: WallSide) => (variant: string) => {
    const v = Object.hasOwn(style[side], variant) ? style[side][variant] : null;
    return v ? v.span : null;
  };
  const right = layoutWall(room.w, room.decor?.right ?? [], spanOf('right'));
  const left = layoutWall(room.d, room.decor?.left ?? [], spanOf('left'));
  return {
    right: right.segments,
    left: left.segments,
    issues: [
      ...right.issues.map((s) => `right ${s}`),
      ...left.issues.map((s) => `left ${s}`),
    ],
  };
}

/**
 * Transformation image → monde (px CSS) du motif de sol : a, b, c, d, e, f
 * d'une DOMMatrix. L'ancre de l'image tombe sur l'origine du monde.
 */
export function floorPatternMatrix(
  floor: FloorSprite,
  pixelRatio: number
): [number, number, number, number, number, number] {
  const s = 1 / pixelRatio;
  return [s, 0, 0, s, -floor.anchor.x * s, -floor.anchor.y * s];
}

/**
 * Ce qui MANQUE au manifeste pour dessiner une liste de choix (lot 12) : un
 * sol, un style de mur, ou une variante d'un style (de chaque côté, plus son
 * bout de mur). Vide = tout se dessine en sprites. Sert aux tests et au
 * diagnostic : le moteur, lui, retombe sur un mur plein ou procédural.
 */
export function missingDecor(
  decor: ManifestDecor,
  want: {
    floors: readonly string[];
    walls: readonly string[];
    variants: readonly string[];
  }
): string[] {
  const out: string[] = [];
  for (const f of want.floors)
    if (!Object.hasOwn(decor.floors, f)) out.push(`floor ${f}`);
  for (const w of want.walls) {
    if (!Object.hasOwn(decor.walls, w)) {
      out.push(`wall ${w}`);
      continue;
    }
    for (const side of ['left', 'right'] as const)
      for (const v of [...want.variants, 'end'])
        if (!Object.hasOwn(decor.walls[w][side], v))
          out.push(`wall ${w} ${side} ${v}`);
  }
  return out;
}

/** Toutes les images de décor dont une salle a besoin (préchargement). */
export function decorSources(
  decor: ManifestDecor,
  room: { decor?: RoomDecor }
): string[] {
  const out = new Set<string>();
  const floorKey = room.decor?.floor;
  if (floorKey && Object.hasOwn(decor.floors, floorKey))
    out.add(decor.floors[floorKey].src);
  const styleKey = room.decor?.wallStyle;
  if (styleKey && Object.hasOwn(decor.walls, styleKey)) {
    const style = decor.walls[styleKey];
    for (const side of ['left', 'right'] as const) {
      const used = new Set(['plain', 'end']);
      for (const slot of room.decor?.[side] ?? []) used.add(slot.variant);
      for (const name of used)
        if (Object.hasOwn(style[side], name)) out.add(style[side][name].src);
    }
  }
  return [...out];
}
