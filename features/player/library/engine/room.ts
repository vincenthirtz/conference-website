// Modèle d'une salle : taille, meubles posés, avatars.
//
// Un meuble posé a une ORIGINE (gx, gy) = coin minimal de son empreinte une
// fois tournée, c'est-à-dire le sommet haut du losange de l'empreinte à
// l'écran — le point où le pipeline place l'`anchor` du sprite. Pour une
// rotation impaire (90°, 270°), l'empreinte {w, d} devient {w: d, d: w}.
// w court le long de gx, d le long de gy. Empreintes et positions en CASES
// (0,5 m), hauteurs en MÈTRES.

import type { RoomDecor } from './decor';
import type { Box3 } from './depthSort';
import { createWalkGrid, type WalkGrid } from './pathfinding';
import { metersToTiles, type Tile } from './projection';

export type Rotation = 0 | 1 | 2 | 3;

export type Footprint = { w: number; d: number };

/**
 * Calque d'un meuble : `floor` (tapis) et `wall` (cadres, horloges accrochés
 * au mur du fond) ne bloquent pas la marche, se dessinent avant les objets et
 * ne se heurtent qu'entre meubles du même calque. Absent = objet ordinaire.
 */
export type FurnitureLayer = 'floor' | 'wall';

/** Ce que le moteur doit savoir d'un meuble pour le poser et le trier. */
export type FurnitureSpec = {
  footprint: Footprint;
  /** Étendue verticale, en mètres. */
  height: number;
  layer?: FurnitureLayer;
};

export type FurnitureCatalog = Record<string, FurnitureSpec>;

export type RoomItem = {
  id: string;
  key: string;
  gx: number;
  gy: number;
  r: Rotation;
};

export type RoomModel = {
  w: number;
  d: number;
  /** Hauteur des deux murs du fond, en mètres. */
  wallHeight: number;
  items: RoomItem[];
  /** Sol, style de mur et variantes (portes, fenêtres) ; absent = procédural. */
  decor?: RoomDecor;
};

/** Meuble inconnu du catalogue : une case, un mètre de haut. */
export const UNKNOWN_SPEC: FurnitureSpec = {
  footprint: { w: 1, d: 1 },
  height: 1,
};

export function specOf(catalog: FurnitureCatalog, key: string): FurnitureSpec {
  return Object.hasOwn(catalog, key) ? catalog[key] : UNKNOWN_SPEC;
}

export function rotatedFootprint(fp: Footprint, r: Rotation): Footprint {
  return r % 2 === 1 ? { w: fp.d, d: fp.w } : { w: fp.w, d: fp.d };
}

export function itemBox(item: RoomItem, spec: FurnitureSpec): Box3 {
  const fp = rotatedFootprint(spec.footprint, item.r);
  return {
    minX: item.gx,
    maxX: item.gx + fp.w,
    minY: item.gy,
    maxY: item.gy + fp.d,
    minZ: 0,
    maxZ: spec.height,
  };
}

export function itemTiles(item: RoomItem, spec: FurnitureSpec): Tile[] {
  const fp = rotatedFootprint(spec.footprint, item.r);
  const out: Tile[] = [];
  for (let j = item.gy; j < item.gy + fp.d; j++)
    for (let i = item.gx; i < item.gx + fp.w; i++) out.push({ i, j });
  return out;
}

export function inRoom(room: { w: number; d: number }, t: Tile): boolean {
  return t.i >= 0 && t.j >= 0 && t.i < room.w && t.j < room.d;
}

/** Calque effectif : 'object' quand le meuble n'en déclare pas. */
export function layerOf(spec: FurnitureSpec): FurnitureLayer | 'object' {
  return spec.layer ?? 'object';
}

/**
 * Grille de marche : toute case couverte par l'empreinte d'un objet est
 * bloquée. Tapis et décor mural restent franchissables (les assises le
 * deviendront avec les poses assises).
 */
export function buildWalkGrid(
  room: RoomModel,
  catalog: FurnitureCatalog
): WalkGrid {
  const grid = createWalkGrid(room.w, room.d);
  for (const item of room.items) {
    const spec = specOf(catalog, item.key);
    if (layerOf(spec) !== 'object') continue;
    for (const t of itemTiles(item, spec)) {
      if (inRoom(room, t)) grid.blocked[t.j * room.w + t.i] = 1;
    }
  }
  return grid;
}

/**
 * Un meuble mural doit avoir le dos contre un mur du fond : rotation 0 le
 * long du mur droit (gy = 0), rotation 1 le long du mur gauche (gx = 0).
 */
export function onBackWall(item: RoomItem): boolean {
  return (item.r === 0 && item.gy === 0) || (item.r === 1 && item.gx === 0);
}

/**
 * Meubles qui se chevauchent (dans un même calque), débordent de la salle ou,
 * pour le décor mural, ne sont pas contre un mur du fond : les empreintes
 * venant du manifeste, une disposition écrite pour d'autres tailles peut ne
 * plus tenir. Renvoie les identifiants fautifs (vide = disposition valide).
 */
export function layoutIssues(
  room: RoomModel,
  catalog: FurnitureCatalog
): string[] {
  const owners = new Map<string, Map<number, string>>();
  const bad = new Set<string>();
  for (const item of room.items) {
    const spec = specOf(catalog, item.key);
    const layer = layerOf(spec);
    if (layer === 'wall' && !onBackWall(item)) bad.add(item.id);
    let owner = owners.get(layer);
    if (!owner) {
      owner = new Map();
      owners.set(layer, owner);
    }
    for (const t of itemTiles(item, spec)) {
      if (!inRoom(room, t)) {
        bad.add(item.id);
        continue;
      }
      const k = t.j * room.w + t.i;
      const prev = owner.get(k);
      if (prev !== undefined && prev !== item.id) {
        bad.add(prev);
        bad.add(item.id);
      }
      owner.set(k, item.id);
    }
  }
  return [...bad];
}

/**
 * Boîte d'un avatar debout en (x, y) : ~0,45 m de côté (0,9 case), 1,65 m de
 * haut. Le côté est pensé en mètres et converti en cases.
 */
export const AVATAR_WIDTH_M = 0.45;
export const AVATAR_RADIUS = metersToTiles(AVATAR_WIDTH_M) / 2;
export const AVATAR_HEIGHT = 1.65;

export function avatarBox(x: number, y: number): Box3 {
  return {
    minX: x - AVATAR_RADIUS,
    maxX: x + AVATAR_RADIUS,
    minY: y - AVATAR_RADIUS,
    maxY: y + AVATAR_RADIUS,
    minZ: 0,
    maxZ: AVATAR_HEIGHT,
  };
}
