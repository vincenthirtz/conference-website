// Manifeste des sprites pré-rendus (pipeline Blender) et cache d'images.
//
// Le manifeste est FACULTATIF : absent, illisible ou d'une autre projection
// (taille de case en px OU en mètres différente), le moteur dessine des
// boîtes et des silhouettes de remplacement. Une image qui ne se charge pas
// retombe aussi sur son remplaçant. Rien ici ne bloque le rendu.
//
// Format (version 1) : voir docs/PLAN-womens-library.md, lot 1, et
// tools/library-assets/README.md.
//   tile = { width: 64, height: 32, meters: 0.5 } ; empreintes en CASES,
//   hauteurs en MÈTRES.
//   Meubles — anchor = pixel de l'IMAGE (à pixelRatio) où tombe le coin
//   d'origine de l'empreinte (gx0, gy0, z = 0). On dessine l'image en
//   (écran(gx0, gy0) − anchor / pixelRatio), taille (width, height) / pixelRatio.
//   `layer` facultatif : 'floor' (tapis) ou 'wall' (décor mural), voir room.ts.
//   Décor (sols, murs) — voir decor.ts. Avatars — voir avatarSprites.ts.
//
// Meubles COMPACTS (lot 11, grand catalogue) : `{ f: [w, d], h, l?, r: [[largeur,
// hauteur, ax, ay] × 4] }`, l'image de la rotation i étant toujours
// `<furnitureBase><clé>_r<i>.webp`. Six fois moins d'octets par meuble, pour un
// manifeste qui reste léger à 200 meubles et plus ; le format verbeux du lot 3
// (`footprint`, `height`, `rotations[].src`) reste lu. En mémoire, les deux
// donnent la même `ManifestFurniture`.

import { type AvatarSheet, parseAvatarSheet } from './avatarSprites';
import { decorSources, type ManifestDecor, parseDecor } from './decor';
import { METERS_PER_TILE, TILE_H, TILE_W } from './projection';
import type {
  FurnitureCatalog,
  FurnitureLayer,
  Footprint,
  RoomModel,
} from './room';

export type SpriteFrame = {
  src: string;
  width: number;
  height: number;
  anchor: { x: number; y: number };
};

export type ManifestFurniture = {
  footprint: Footprint;
  /** Mètres. */
  height: number;
  layer?: FurnitureLayer;
  /** 4 entrées, r = 0..3 par pas de 90°. */
  rotations: SpriteFrame[];
};

export type LibraryManifest = {
  version: 1;
  tile: { width: number; height: number; meters: number };
  pixelRatio: number;
  furniture: Record<string, ManifestFurniture>;
  /** Sols et murs ; vide si le manifeste n'en a pas. */
  decor: ManifestDecor;
  avatars: Record<string, AvatarSheet>;
};

export const SPIKE_MANIFEST_URL = '/library/spike/manifest.json';

/** Dossier des sprites de meubles quand le manifeste n'en déclare pas. */
export const DEFAULT_FURNITURE_BASE = '/library/spike/furniture/';

/** Clé de meuble utilisable dans un nom de fichier (celle du catalogue). */
const SPRITE_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * L'URL d'un sprite de meuble selon la règle du pipeline, ou null pour une clé
 * qui ne peut pas être un nom de fichier. Sert aussi aux vignettes de la
 * boutique, sans attendre le manifeste.
 */
export function furnitureSpriteUrl(
  key: string,
  rotation = 0,
  base: string = DEFAULT_FURNITURE_BASE
): string | null {
  if (!SPRITE_KEY_RE.test(key) || rotation < 0 || rotation > 3) return null;
  return `${base}${key}_r${rotation}.webp`;
}

/** Un dossier d'URL même origine (`/…/`), sans remontée ni protocole. */
function safeBase(v: unknown): string | null {
  return typeof v === 'string' &&
    /^\/[a-z0-9/_-]*\/$/i.test(v) &&
    !v.includes('//') &&
    !v.includes('..')
    ? v
    : null;
}

/**
 * Meubles de remplacement (cases × mètres), quand le manifeste manque ou ne
 * connaît pas la clé. Le manifeste, lui, l'emporte toujours (mergeCatalog).
 */
export const PLACEHOLDER_CATALOG: FurnitureCatalog = {
  bookshelf: { footprint: { w: 3, d: 2 }, height: 2.0 },
  armchair: { footprint: { w: 2, d: 2 }, height: 1.0 },
  lamp: { footprint: { w: 2, d: 1 }, height: 1.6 },
  table: { footprint: { w: 4, d: 2 }, height: 0.75 },
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isPositiveInt = (v: unknown): v is number =>
  isNum(v) && Number.isInteger(v) && v > 0;

function parseFrame(v: unknown): SpriteFrame | null {
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

/** Entrée compacte (lot 11) : `{ f, h, l?, r }`, images déduites de la clé. */
function parseCompactFurniture(
  key: string,
  v: Record<string, unknown>,
  base: string
): ManifestFurniture | null {
  if (!Array.isArray(v.f) || v.f.length !== 2) return null;
  const [w, d] = v.f;
  if (!isPositiveInt(w) || !isPositiveInt(d)) return null;
  if (!isNum(v.h) || v.h <= 0) return null;
  if (!Array.isArray(v.r) || v.r.length !== 4) return null;
  if (v.l !== undefined && v.l !== 'floor' && v.l !== 'wall') return null;
  const rotations: SpriteFrame[] = [];
  for (let i = 0; i < 4; i++) {
    const r = v.r[i];
    const src = furnitureSpriteUrl(key, i, base);
    if (!src || !Array.isArray(r) || r.length !== 4 || !r.every(isNum))
      return null;
    const [width, height, x, y] = r as number[];
    if (width <= 0 || height <= 0) return null;
    rotations.push({ src, width, height, anchor: { x, y } });
  }
  const out: ManifestFurniture = {
    footprint: { w, d },
    height: v.h,
    rotations,
  };
  if (v.l) out.layer = v.l;
  return out;
}

function parseFurniture(
  key: string,
  v: unknown,
  base: string
): ManifestFurniture | null {
  if (isObj(v) && Array.isArray(v.r))
    return parseCompactFurniture(key, v, base);
  if (!isObj(v) || !isObj(v.footprint)) return null;
  const { w, d } = v.footprint;
  if (!isPositiveInt(w) || !isPositiveInt(d)) return null;
  if (!isNum(v.height) || v.height <= 0) return null;
  if (!Array.isArray(v.rotations) || v.rotations.length !== 4) return null;
  const rotations = v.rotations.map(parseFrame);
  if (rotations.some((r) => r === null)) return null;
  if (v.layer !== undefined && v.layer !== 'floor' && v.layer !== 'wall')
    return null;
  const out: ManifestFurniture = {
    footprint: { w, d },
    height: v.height,
    rotations: rotations as SpriteFrame[],
  };
  if (v.layer) out.layer = v.layer;
  return out;
}

/** Même projection que le moteur : px de la case ET mètres par case. */
function sameTile(tile: unknown): boolean {
  return (
    isObj(tile) &&
    tile.width === TILE_W &&
    tile.height === TILE_H &&
    tile.meters === METERS_PER_TILE
  );
}

/**
 * Valide un manifeste. Un meuble ou un avatar mal formé est ignoré (il
 * retombe sur son remplaçant) ; un manifeste d'une autre version ou d'une
 * autre case (px ou mètres, `meters` absent compris) est rejeté en bloc : ses
 * sprites seraient décalés ou à la mauvaise échelle.
 */
export function parseManifest(json: unknown): LibraryManifest | null {
  if (!isObj(json) || json.version !== 1 || !sameTile(json.tile)) return null;
  if (!isNum(json.pixelRatio) || json.pixelRatio <= 0) return null;
  if (!isObj(json.furniture)) return null;
  const base =
    json.furnitureBase === undefined
      ? DEFAULT_FURNITURE_BASE
      : safeBase(json.furnitureBase);
  // Un dossier de sprites suspect (autre origine, remontée) : on rejette
  // le manifeste plutôt que de charger des images d'ailleurs.
  if (base === null) return null;
  const furniture: Record<string, ManifestFurniture> = {};
  for (const [key, raw] of Object.entries(json.furniture)) {
    const f = parseFurniture(key, raw, base);
    if (f) furniture[key] = f;
  }
  const avatars: Record<string, AvatarSheet> = {};
  if (isObj(json.avatars)) {
    for (const [id, raw] of Object.entries(json.avatars)) {
      const a = parseAvatarSheet(raw);
      if (a) avatars[id] = a;
    }
  }
  return {
    version: 1,
    tile: { width: TILE_W, height: TILE_H, meters: METERS_PER_TILE },
    pixelRatio: json.pixelRatio,
    furniture,
    decor: parseDecor(json.decor, json.pixelRatio),
    avatars,
  };
}

type Fetcher = (
  url: string
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Charge le manifeste ; null s'il est absent ou invalide (jamais d'exception). */
export async function loadManifest(
  url = SPIKE_MANIFEST_URL,
  fetcher: Fetcher = (u) => globalThis.fetch(u, { cache: 'no-cache' })
): Promise<LibraryManifest | null> {
  try {
    const res = await fetcher(url);
    if (!res.ok) return null;
    return parseManifest(await res.json());
  } catch {
    return null;
  }
}

/** Catalogue du moteur : le manifeste l'emporte sur les remplaçants. */
export function mergeCatalog(
  manifest: LibraryManifest | null
): FurnitureCatalog {
  const out: FurnitureCatalog = { ...PLACEHOLDER_CATALOG };
  if (manifest) {
    for (const [key, f] of Object.entries(manifest.furniture))
      out[key] = f.layer
        ? { footprint: f.footprint, height: f.height, layer: f.layer }
        : { footprint: f.footprint, height: f.height };
  }
  return out;
}

/** Identifiants d'avatars du manifeste, triés (ordre stable). */
export function avatarIdsOf(manifest: LibraryManifest | null): string[] {
  return manifest ? Object.keys(manifest.avatars).sort() : [];
}

type Entry = { img: HTMLImageElement; state: 'loading' | 'ready' | 'error' };

/**
 * Cache d'images décodées. `get` lance le chargement à la première demande et
 * renvoie null tant que l'image n'est pas décodée (on dessine le remplaçant
 * en attendant) ; `onChange` est appelé quand une image devient prête ou
 * échoue, pour redemander un rendu. Les feuilles d'avatars passent par ici
 * aussi, à la première image où l'avatar est dessiné (chargement paresseux).
 */
export class ImageCache {
  private entries = new Map<string, Entry>();

  constructor(private onChange: () => void) {}

  get(src: string): HTMLImageElement | null {
    const hit = this.entries.get(src);
    if (hit) return hit.state === 'ready' ? hit.img : null;
    const img = new Image();
    img.decoding = 'async';
    const entry: Entry = { img, state: 'loading' };
    this.entries.set(src, entry);
    img.src = src;
    img
      .decode()
      .then(() => {
        entry.state = 'ready';
      })
      .catch(() => {
        entry.state = 'error';
      })
      .finally(() => this.onChange());
    return null;
  }

  /** Précharge toutes les rotations des meubles listés. */
  preload(manifest: LibraryManifest, keys: Iterable<string>): void {
    for (const key of keys) {
      if (!Object.hasOwn(manifest.furniture, key)) continue;
      for (const r of manifest.furniture[key].rotations) this.get(r.src);
    }
  }

  /** Précharge le sol et les segments de murs d'une salle. */
  preloadDecor(manifest: LibraryManifest, room: RoomModel): void {
    for (const src of decorSources(manifest.decor, room)) this.get(src);
  }
}
