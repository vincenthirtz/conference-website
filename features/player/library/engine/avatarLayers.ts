// Avatars COMPOSÉS par calques (lot 13 de docs/PLAN-womens-library.md) :
// l'index des calques rendus, les calques d'un look, la mise en page d'une
// bande composée et le cache LRU des bandes. PUR : ni DOM ni réseau — le
// compositeur (lookCompositor.ts) dessine, ce module calcule.
//
// L'INDEX (/library/spike/avatars/layers/layers.json, écrit par
// tools/library-assets/render_layers.mjs) est à part du manifeste : il n'est
// chargé que quand un avatar composé est dessiné.
//   { version: 1, tile, pixelRatio, layers: { "<calque>": {
//       idle|walk|sit: { sheet, width, height, fps, strideMeters?,
//                        directions: [ [ [x, y, w, h, ax, ay], … ] | null ] × 8 }
//   } } }
// Calques : `body.<carnation>` (en couleur), `bottom.<tenue>`, `top.<tenue>`,
// `hair.<coiffure>` (en niveaux de gris, teintés ici). Chaque image a son
// ancre au sol (ax, ay) : les calques d'une même image se superposent en
// alignant leurs ancres. L'occlusion est déjà dans les images (voir
// render_avatar_layers.py) : on superpose corps, bas, haut, cheveux.
//
// UNE BANDE = les images composées d'un look pour un usage : `idle` (les 8
// directions), `walk` (les 8 images d'UNE direction), `sit` (les 8
// directions). On ne compose que ce qu'on dessine ; le cache garde les
// bandes récentes dans un budget d'octets (largeur × hauteur × 4).

import {
  LIBRARY_LOOK_HAIR_COLORS,
  LIBRARY_LOOK_OUTFIT_COLORS,
  type LibraryAvatarLook,
} from '@/config/library/avatarLook';
import { type AvatarPose, MAX_SHEET_PX, type SheetRef } from './avatarSprites';
import type { Direction } from './motion';
import { METERS_PER_TILE, TILE_H, TILE_W } from './projection';

/** L'index des calques, à côté du manifeste. */
export const AVATAR_LAYERS_URL = '/library/spike/avatars/layers/layers.json';

/** Budget des bandes composées (octets décodés). */
export const LOOK_CACHE_BYTES = 64 * 1024 * 1024;

/** Gouttière transparente entre deux images d'une bande (px). */
export const STRIP_GUTTER = 2;

export type LayerRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ancre au sol, relative au coin du rect (px d'image) ; peut être hors du rect. */
  ax: number;
  ay: number;
};

export type LayerAnimation = {
  sheet: SheetRef;
  fps: number;
  strideMeters?: number;
  /** Index = direction 0..7 ; null : direction absente. */
  directions: (LayerRect[] | null)[];
};

export type AvatarLayerSheets = {
  idle: LayerAnimation;
  walk?: LayerAnimation;
  sit?: LayerAnimation;
};

export type LayerIndex = {
  pixelRatio: number;
  layers: Record<string, AvatarLayerSheets>;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const isPositive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

function parseRect(v: unknown, sheet: SheetRef): LayerRect | null {
  if (!Array.isArray(v) || v.length !== 6) return null;
  const [x, y, w, h, ax, ay] = v;
  if (!isInt(x, 0) || !isInt(y, 0) || !isInt(w, 1) || !isInt(h, 1)) return null;
  if (x + w > sheet.width || y + h > sheet.height) return null;
  // Recadrage SERRÉ : l'ancre peut tomber hors du rect (une coiffure ne
  // descend pas jusqu'aux pieds), dans des bornes raisonnables.
  const lim = -MAX_SHEET_PX;
  if (!isInt(ax, lim) || !isInt(ay, lim)) return null;
  if (ax > MAX_SHEET_PX || ay > MAX_SHEET_PX) return null;
  return { x, y, w, h, ax, ay };
}

function parseLayerAnimation(v: unknown): LayerAnimation | null {
  if (!isObj(v) || typeof v.sheet !== 'string' || !v.sheet) return null;
  if (!v.sheet.startsWith('/library/')) return null;
  const { width, height } = v;
  if (!isInt(width, 1) || !isInt(height, 1)) return null;
  if (width > MAX_SHEET_PX || height > MAX_SHEET_PX) return null;
  if (!isPositive(v.fps)) return null;
  if (v.strideMeters !== undefined && !isPositive(v.strideMeters)) return null;
  if (!Array.isArray(v.directions) || v.directions.length !== 8) return null;
  const sheet: SheetRef = { src: v.sheet, width, height };
  const directions: (LayerRect[] | null)[] = [];
  for (const raw of v.directions) {
    if (raw === null) {
      directions.push(null);
      continue;
    }
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const rects = raw.map((r) => parseRect(r, sheet));
    if (rects.some((r) => r === null)) return null;
    directions.push(rects as LayerRect[]);
  }
  const out: LayerAnimation = { sheet, fps: v.fps, directions };
  if (v.strideMeters !== undefined) out.strideMeters = v.strideMeters;
  return out;
}

/**
 * Valide l'index. Un calque mal formé est ignoré (les looks qui le portent
 * retombent sur leur `avatarId`) ; un index d'une autre version ou d'une
 * autre case est rejeté en bloc.
 */
export function parseLayerIndex(json: unknown): LayerIndex | null {
  if (!isObj(json) || json.version !== 1 || !isObj(json.tile)) return null;
  const { tile } = json;
  if (
    tile.width !== TILE_W ||
    tile.height !== TILE_H ||
    tile.meters !== METERS_PER_TILE
  )
    return null;
  if (!isPositive(json.pixelRatio) || !isObj(json.layers)) return null;
  const layers: Record<string, AvatarLayerSheets> = {};
  for (const [id, raw] of Object.entries(json.layers)) {
    if (!/^(body|top|bottom|hair)\.[a-z0-9_]{1,32}$/.test(id) || !isObj(raw))
      continue;
    const idle = parseLayerAnimation(raw.idle);
    if (!idle) continue;
    const entry: AvatarLayerSheets = { idle };
    let ok = true;
    for (const name of ['walk', 'sit'] as const) {
      if (raw[name] === undefined) continue;
      const a = parseLayerAnimation(raw[name]);
      if (!a) ok = false;
      else entry[name] = a;
    }
    if (ok) layers[id] = entry;
  }
  return { pixelRatio: json.pixelRatio, layers };
}

/* ------------------------------------------------------- les calques --- */

export type Rgb = readonly [number, number, number];

/** Un calque d'un look et sa teinte (null : rendu en couleur, le corps). */
export type LookLayer = { id: string; tint: Rgb | null };

const colorOf = (list: readonly { id: string; rgb: Rgb }[], id: string): Rgb =>
  list.find((c) => c.id === id)?.rgb ?? [255, 255, 255];

/**
 * Exposant appliqué à la couleur de la palette avant la multiplication : les
 * calques gris passent par la courbe AgX du rendu, la multiplication en
 * sortie assombrirait les tons moyens. Calé sur les avatars d'origine
 * (tests/unit/libraryAvatarLayers.test.ts).
 */
export const TINT_GAMMA = 0.8;

/** La couleur multipliée sur un calque gris pour obtenir `rgb` (sRGB 0-255). */
export function tintFor(rgb: Rgb): Rgb {
  const f = (c: number) =>
    Math.round(255 * (Math.min(255, Math.max(0, c)) / 255) ** TINT_GAMMA);
  return [f(rgb[0]), f(rgb[1]), f(rgb[2])];
}

/** Les calques d'un look, dans l'ordre de superposition. */
export function lookLayers(look: LibraryAvatarLook): LookLayer[] {
  return [
    { id: `body.${look.skin}`, tint: null },
    {
      id: `bottom.${look.outfit}`,
      tint: tintFor(colorOf(LIBRARY_LOOK_OUTFIT_COLORS, look.bottomColor)),
    },
    {
      id: `top.${look.outfit}`,
      tint: tintFor(colorOf(LIBRARY_LOOK_OUTFIT_COLORS, look.outfitColor)),
    },
    {
      id: `hair.${look.hair}`,
      tint: tintFor(colorOf(LIBRARY_LOOK_HAIR_COLORS, look.hairColor)),
    },
  ];
}

/* ------------------------------------------------------- les bandes --- */

/** Ce qu'une bande contient : un look, une animation, une direction (marche). */
export type StripKey = { pose: AvatarPose; dir: Direction };

/** `idle` et `sit` : une bande pour les 8 directions ; `walk` : une par direction. */
export function stripKeyOf(
  code: string,
  pose: AvatarPose,
  dir: Direction
): string {
  return pose === 'walk' ? `${code}|walk|${dir}` : `${code}|${pose}`;
}

/** Les images d'un calque qui composent la bande, dans l'ordre des cellules. */
export function stripFrames(
  anim: LayerAnimation,
  pose: AvatarPose,
  dir: Direction
): LayerRect[] | null {
  if (pose === 'walk') return anim.directions[dir] ?? null;
  const out: LayerRect[] = [];
  for (let d = 0; d < 8; d++) {
    const rects = anim.directions[d];
    if (!rects?.length) return null;
    out.push(rects[0]);
  }
  return out;
}

/** Une image composée dans sa bande : boîte et ancre au sol (px d'image). */
export type StripCell = LayerRect;

export type StripLayout = {
  width: number;
  height: number;
  cells: StripCell[];
  /** [calque][image] : où poser le rect source du calque dans la bande. */
  placements: { dx: number; dy: number }[][];
};

/**
 * Mise en page d'une bande : pour chaque image, la boîte qui contient tous
 * ses calques alignés sur leur ancre ; les images côte à côte, avec une
 * gouttière. null si les calques n'ont pas le même nombre d'images ou si la
 * bande dépasserait MAX_SHEET_PX.
 */
export function stripLayout(
  frames: readonly LayerRect[][]
): StripLayout | null {
  if (!frames.length) return null;
  const count = frames[0].length;
  if (!count || frames.some((f) => f.length !== count)) return null;
  const cells: StripCell[] = [];
  const placements: { dx: number; dy: number }[][] = frames.map(() => []);
  let x = STRIP_GUTTER;
  let height = 0;
  for (let i = 0; i < count; i++) {
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    for (const layer of frames) {
      const r = layer[i];
      left = Math.max(left, r.ax);
      right = Math.max(right, r.w - r.ax);
      top = Math.max(top, r.ay);
      bottom = Math.max(bottom, r.h - r.ay);
    }
    const cell = {
      x,
      y: STRIP_GUTTER,
      w: Math.max(1, left + right),
      h: Math.max(1, top + bottom),
      ax: left,
      ay: top,
    };
    cells.push(cell);
    frames.forEach((layer, l) => {
      const r = layer[i];
      placements[l].push({ dx: cell.x + left - r.ax, dy: cell.y + top - r.ay });
    });
    x += cell.w + STRIP_GUTTER;
    height = Math.max(height, cell.h);
  }
  const out = {
    width: x,
    height: height + 2 * STRIP_GUTTER,
    cells,
    placements,
  };
  if (out.width > MAX_SHEET_PX || out.height > MAX_SHEET_PX) return null;
  return out;
}

/** La cellule à dessiner dans une bande pour une direction et une image. */
export function stripCellIndex(
  pose: AvatarPose,
  dir: Direction,
  frame: number
): number {
  return pose === 'walk' ? frame : dir;
}

/* ------------------------------------------------------ le cache LRU --- */

/**
 * Cache borné en octets, le moins récemment servi sort d'abord. Une entrée
 * servie pendant l'image en cours (`frame`) ne sort jamais : 30 avatars à
 * l'écran ne se chassent pas l'un l'autre à chaque image, le budget est
 * alors dépassé le temps qu'il faut.
 */
export class LruBudget<V> {
  private entries = new Map<
    string,
    { value: V; bytes: number; frame: number }
  >();
  private total = 0;
  private frame = 0;

  constructor(
    private budget: number,
    private onEvict: (value: V) => void = () => undefined
  ) {}

  /** Début d'une nouvelle image : les entrées de la précédente redeviennent évinçables. */
  nextFrame(): void {
    this.frame++;
  }

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    this.entries.delete(key);
    hit.frame = this.frame;
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, bytes: number): void {
    const old = this.entries.get(key);
    if (old) {
      this.total -= old.bytes;
      this.entries.delete(key);
      this.onEvict(old.value);
    }
    this.entries.set(key, { value, bytes, frame: this.frame });
    this.total += bytes;
    this.evict();
  }

  private evict(): void {
    for (const [key, e] of this.entries) {
      if (this.total <= this.budget) return;
      if (e.frame === this.frame) continue;
      this.entries.delete(key);
      this.total -= e.bytes;
      this.onEvict(e.value);
    }
  }

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    for (const e of this.entries.values()) this.onEvict(e.value);
    this.entries.clear();
    this.total = 0;
  }
}
