// Sprites des PERSONNAGES NON JOUEURS (PNJ) de la Women's Library — lot 16
// de docs/PLAN-womens-library.md (le fantôme d'Halloween du hall).
//
// Un PNJ n'est PAS un meuble : il n'est pas au catalogue (celui de l'API), ne
// s'achète pas, ne se pose pas, et ne bloque pas la marche. Ses images vivent
// à part (`public/library/spike/npc/`, rendues par
// `tools/library-assets/build_npc.mjs`) avec un petit index, `npc.json`, que
// seul le hall charge, et seulement pendant l'événement.
//
// Format (version 1), même contrat de case que le manifeste (`assets.ts`) :
//   { version: 1, tile: { width: 64, height: 32, meters: 0.5 }, pixelRatio,
//     npcs: { <clé>: { h, rad, d: [[largeur, hauteur, ax, ay] × 8] } } }
//   - `h` : hauteur du modèle (m) ; `rad` : son rayon au sol (m), pour
//     l'ombre que dessine le moteur (aucune n'est cuite : un PNJ flotte) ;
//   - `d[k]` : l'image de la DIRECTION ÉCRAN k (`motion.ts`, 0 = haut de
//     l'écran, sens horaire, 4 = face à la caméra), toujours
//     `<dossier><clé>_d<k>.webp`, en px à pixelRatio ;
//   - ancre = le pixel du point du sol SOUS L'AXE du modèle (le bas de sa
//     silhouette posé à z = 0). On dessine l'image en
//     (écran(x, y, z_vol) − ancre / pixelRatio), taille / pixelRatio.
// Un index absent, illisible ou d'une autre case : pas de PNJ (rien ne casse).

import type { SpriteFrame } from './assets';
import type { Direction } from './motion';
import { METERS_PER_TILE, TILE_H, TILE_W } from './projection';

export const NPC_INDEX_URL = '/library/spike/npc/npc.json';
/** Le dossier des images, déduit de l'index (même dossier). */
export const NPC_BASE = '/library/spike/npc/';

export type NpcSheet = {
  /** Hauteur (m). */
  height: number;
  /** Rayon au sol (m). */
  radius: number;
  /** 8 images, une par direction écran. */
  frames: readonly SpriteFrame[];
};

export type NpcIndex = {
  pixelRatio: number;
  npcs: Readonly<Record<string, NpcSheet>>;
};

const NPC_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function parseSheet(key: string, v: unknown, base: string): NpcSheet | null {
  if (!isObj(v) || !isNum(v.h) || v.h <= 0 || !isNum(v.rad) || v.rad <= 0)
    return null;
  if (!Array.isArray(v.d) || v.d.length !== 8) return null;
  const frames: SpriteFrame[] = [];
  for (let k = 0; k < 8; k++) {
    const f = v.d[k];
    if (!Array.isArray(f) || f.length !== 4 || !f.every(isNum)) return null;
    const [width, height, x, y] = f as number[];
    if (width <= 0 || height <= 0) return null;
    frames.push({
      src: `${base}${key}_d${k}.webp`,
      width,
      height,
      anchor: { x, y },
    });
  }
  return { height: v.h, radius: v.rad, frames };
}

/** Valide l'index ; null s'il est d'une autre version ou d'une autre case. */
export function parseNpcIndex(
  json: unknown,
  base: string = NPC_BASE
): NpcIndex | null {
  if (!isObj(json) || json.version !== 1) return null;
  const tile = json.tile;
  if (
    !isObj(tile) ||
    tile.width !== TILE_W ||
    tile.height !== TILE_H ||
    tile.meters !== METERS_PER_TILE
  )
    return null;
  if (!isNum(json.pixelRatio) || json.pixelRatio <= 0) return null;
  if (!isObj(json.npcs)) return null;
  const npcs: Record<string, NpcSheet> = {};
  for (const [key, raw] of Object.entries(json.npcs)) {
    if (!NPC_KEY_RE.test(key)) continue;
    const sheet = parseSheet(key, raw, base);
    if (sheet) npcs[key] = sheet;
  }
  return { pixelRatio: json.pixelRatio, npcs };
}

type Fetcher = (
  url: string
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Charge l'index ; null s'il est absent ou invalide (jamais d'exception). */
export async function loadNpcIndex(
  url = NPC_INDEX_URL,
  fetcher: Fetcher = (u) => globalThis.fetch(u)
): Promise<NpcIndex | null> {
  try {
    const res = await fetcher(url);
    if (!res.ok) return null;
    return parseNpcIndex(await res.json());
  } catch {
    return null;
  }
}

/** L'image d'une direction (0..7). */
export function npcFrame(sheet: NpcSheet, dir: Direction): SpriteFrame {
  return sheet.frames[dir] ?? sheet.frames[4];
}
