// Ce qu'on FAIT d'un meuble (lot 15 de docs/PLAN-womens-library.md) : s'y
// asseoir, s'y allonger, ou s'en servir (lire, jouer, se réchauffer…). PUR :
// ni DOM, ni réseau, ni horloge.
//
// UN PROFIL PAR FAMILLE (`FURNITURE_PROFILES`, une ligne chacune ; les
// variantes de couleur suivent leur base par `getFurniture(key).family`),
// sinon un profil par CATÉGORIE (assise, lit, plante). Coordonnées LOCALES à
// la rotation 0, en cases : u le long de la largeur w (gx), v le long de la
// profondeur d (gy) ; l'AVANT du meuble est le bord v = d (vers +gy, la
// direction 5 de l'écran). Les rotations tournent ces points (`localToGrid`) :
//   r0 (u, v)   r1 (v, w − u)   r2 (w − u, d − v)   r3 (d − v, u)
// et l'avant regarde alors 5, 3, 1, 7 (vérifié sur les sprites).
//
//   - `sit` : l'assise (m), le bassin à `hip` cases du dos, les places le
//     long de w (`places`, une au milieu par défaut) ; `low` pour un pouf ou
//     un coussin de sol (pose `sit_low`) ; `back: false` pour un siège sans
//     dossier (toujours dessinée devant lui) ;
//   - `lie` : le couchage (m), l'axe du corps (`d` : la tête au dos, v = 0,
//     les pieds vers l'avant ; `u` : la tête au bout +u) et chaque bassin ;
//   - `use` : une activité (s'habiller, lire, jouer…), debout devant.
//
// UNE PLACE (`FurnitureSpot`) : le point du bassin dans la salle, la
// direction (le regard assise, les pieds allongée), la pose et la hauteur.
// L'avatar y est DESSINÉ, mais il se tient — pour marcher, et pour les autres
// clientes — sur sa CASE D'ACCÈS : une case libre devant la place, sinon la
// plus proche qui touche le meuble (`spotAccess`, `serviceAccess`).

import {
  type FurnitureCategory,
  getFurniture,
} from '@/config/library/furniture';
import type { RestPose } from './avatarSprites';
import { type Direction, directionFromDelta } from './motion';
import { isWalkable, type WalkGrid } from './pathfinding';
import type { Tile } from './projection';
import {
  type Footprint,
  type FurnitureCatalog,
  itemBox,
  type RoomItem,
  type Rotation,
  specOf,
} from './room';

export const USE_ACTIVITIES = [
  'dress',
  'read',
  'play',
  'warm',
  'music',
  'watch',
  'water',
] as const;
export type UseActivity = (typeof USE_ACTIVITIES)[number];

/** Ce qu'un appui sur le meuble propose (son nom traduit vient de l'écran). */
export type InteractionKind = 'sit' | 'lie' | UseActivity;

type SitProfile = {
  kind: 'sit';
  seatM: number;
  hip: number;
  places?: readonly number[];
  low?: true;
  back?: false;
};
/** Un bord de l'empreinte locale : le dos (v = 0), l'avant (v = d), les bouts (u = 0, u = w). */
type Edge = 'v0' | 'vd' | 'u0' | 'uw';
/**
 * Un panneau plein le long d'un bord (tête de lit, dossier), haut de `h` m —
 * ou un profil de hauteurs (m) régulièrement réparties le long du bord, de
 * u (ou v) = 0 à son bout. Jamais plus haut que le panneau du sprite : au-delà,
 * on redessinerait ce qui est derrière lui (coussin, matelas) sur elle.
 */
type Panel = {
  edge: Edge;
  h: number | readonly number[];
  /** Le panneau du sprite est en retrait du bord de l'empreinte (cases). */
  inset?: number;
};
type LieProfile = {
  kind: 'lie';
  surfaceM: number;
  axis: 'd' | 'u';
  at: readonly (readonly [number, number])[];
  /** Tourné vers la caméra, il passe DEVANT l'allongée (renderer). */
  panels?: readonly Panel[];
};
type UseProfile = { kind: 'use'; activity: UseActivity };
export type FurnitureProfile = SitProfile | LieProfile | UseProfile;

const seat = (
  seatM: number,
  hip: number,
  places?: readonly number[]
): SitProfile => ({ kind: 'sit', seatM, hip, ...(places ? { places } : {}) });
/** Sans dossier : le bassin au milieu de l'empreinte. */
const stool = (seatM: number, hip = 0.5): SitProfile => ({
  kind: 'sit',
  seatM,
  hip,
  back: false,
});
const low = (seatM: number, hip: number): SitProfile => ({
  kind: 'sit',
  seatM,
  hip,
  low: true,
  back: false,
});
const lie = (
  surfaceM: number,
  axis: 'd' | 'u',
  at: LieProfile['at'],
  panels?: readonly Panel[]
): LieProfile => ({
  kind: 'lie',
  surfaceM,
  axis,
  at,
  ...(panels ? { panels } : {}),
});
const use = (activity: UseActivity): UseProfile => ({ kind: 'use', activity });

/**
 * LES PROFILS, par famille. Assises : `seat(assise m, bassin depuis le dos,
 * places le long de w)`. Lits : `lie(couchage m, axe, [[u, v] du bassin]…)`.
 * Calés à l'œil sur les sprites, dans les 4 rotations (lot 15).
 */
export const FURNITURE_PROFILES: Readonly<Record<string, FurnitureProfile>> = {
  armchair: seat(0.45, 0.75),
  armchair_green: seat(0.47, 0.75),
  armchair_scandi: seat(0.42, 0.8),
  chair: seat(0.48, 0.42),
  chair_painted: seat(0.46, 0.42),
  school_chair: seat(0.45, 0.8),
  carved_chair: seat(0.48, 0.8),
  rocking_chair: seat(0.45, 0.8),
  lounge_chair: seat(0.45, 1.1),
  sofa: seat(0.45, 0.8, [0.85, 2.15]),
  sofa_large: seat(0.48, 0.85, [1.3, 3, 4.7]),
  sofa_chesterfield: seat(0.45, 0.8, [1.25, 2.75]),
  sofa_painted: seat(0.48, 0.75, [1.1, 2.5, 3.9]),
  bench: seat(0.45, 0.45, [0.85, 2.15]),
  ottoman: stool(0.55, 1),
  stool: stool(0.44),
  stool_folding: stool(0.44),
  stool_painted: stool(0.58),
  stool_lacquer: stool(0.6),
  bar_stool: stool(0.75),
  bean_bag: low(0.25, 0.9),
  floor_cushion: low(0.16, 0.5),
  bed: lie(
    0.52,
    'd',
    [
      [0.85, 1.8],
      [2.15, 1.8],
    ],
    [
      { edge: 'v0', h: 0.9 },
      { edge: 'vd', h: 0.7 },
    ]
  ),
  bed_iron: lie(0.48, 'd', [[1, 1.85]]),
  daybed: lie(
    0.48,
    'u',
    [[2.1, 1.1]],
    [
      {
        edge: 'v0',
        inset: 0.35,
        h: [0.85, 0.9, 0.95, 0.97, 0.97, 0.95, 0.92, 0.85, 0.8],
      },
    ]
  ),
  wardrobe: use('dress'),
  mirror: use('dress'),
  bookshelf: use('read'),
  bookshelf_filled: use('read'),
  bookshelf_double: use('read'),
  book_stack: use('read'),
  book_tower: use('read'),
  lectern: use('read'),
  card_catalog: use('read'),
  arcade_cabinet: use('play'),
  game_console: use('play'),
  gaming_desk: use('play'),
  pc_tower: use('play'),
  chess_set: use('play'),
  dartboard: use('play'),
  fireplace: use('warm'),
  fire_pit: use('warm'),
  boombox: use('music'),
  tv_retro: use('watch'),
  projector_screen: use('watch'),
  watering_can: use('water'),
};

/** Une famille sans profil : celui de sa catégorie, s'il y en a un. */
const BY_CATEGORY: Partial<
  Record<FurnitureCategory, (fp: Footprint) => FurnitureProfile>
> = {
  seating: (fp) => seat(0.45, fp.d === 1 ? 0.45 : 0.8),
  bed: (fp) =>
    fp.d >= fp.w
      ? lie(0.55, 'd', [[fp.w / 2, Math.min(1.95, fp.d / 2)]])
      : lie(0.55, 'u', [[Math.max(fp.w / 2, fp.w - 1.9), fp.d / 2]]),
  plant: () => use('water'),
};

/** Le profil d'un meuble (`fp` : son empreinte à la rotation 0), ou null. */
export function profileOf(key: string, fp: Footprint): FurnitureProfile | null {
  const f = getFurniture(key);
  const family = f?.family ?? key;
  if (Object.hasOwn(FURNITURE_PROFILES, family))
    return FURNITURE_PROFILES[family];
  const byCategory = f ? BY_CATEGORY[f.category] : undefined;
  return byCategory ? byCategory(fp) : null;
}

export function kindOf(p: FurnitureProfile): InteractionKind {
  return p.kind === 'use' ? p.activity : p.kind;
}

/** Ce que propose un meuble posé, ou null (aucune interaction). */
export function interactionOf(
  item: RoomItem,
  catalog: FurnitureCatalog
): InteractionKind | null {
  const p = profileOf(item.key, specOf(catalog, item.key).footprint);
  return p ? kindOf(p) : null;
}

/* ------------------------------------------------------- géométrie --- */

/** Un point local (u, v) d'un meuble, en coordonnées de la salle. */
export function localToGrid(
  item: Pick<RoomItem, 'gx' | 'gy' | 'r'>,
  fp: Footprint,
  u: number,
  v: number
): { x: number; y: number } {
  const { gx, gy } = item;
  switch (item.r) {
    case 1:
      return { x: gx + v, y: gy + fp.w - u };
    case 2:
      return { x: gx + fp.w - u, y: gy + fp.d - v };
    case 3:
      return { x: gx + fp.d - v, y: gy + u };
    default:
      return { x: gx + u, y: gy + v };
  }
}

/** Un vecteur local (du, dv) tourné, puis sa direction à l'écran. */
export function localDirection(r: Rotation, du: number, dv: number): Direction {
  const [dx, dy] =
    r === 1 ? [dv, -du] : r === 2 ? [-du, -dv] : r === 3 ? [-dv, du] : [du, dv];
  return directionFromDelta(dx, dy) ?? 5;
}

/** Dos à la caméra (haut de l'écran) : le dossier passe devant elle. */
export function facesAway(dir: Direction): boolean {
  return dir === 7 || dir === 0 || dir === 1;
}

/** Une place d'un meuble : où le bassin repose, et comment. */
export type FurnitureSpot = {
  index: number;
  pose: RestPose;
  /** Le bassin, en coordonnées continues de la salle. */
  x: number;
  y: number;
  /** Assise : le regard ; allongée : les pieds. */
  dir: Direction;
  /** Hauteur de l'assise ou du couchage (m). */
  surfaceM: number;
  /** Dessinée juste AVANT son meuble (dos à la caméra, derrière le dossier). */
  behind: boolean;
};

type LocalSpot = FurnitureSpot & {
  u: number;
  v: number;
  fp: Footprint;
  profile: SitProfile | LieProfile;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

function localSpots(item: RoomItem, catalog: FurnitureCatalog): LocalSpot[] {
  const fp = specOf(catalog, item.key).footprint;
  const profile = profileOf(item.key, fp);
  if (!profile || profile.kind === 'use') return [];
  if (profile.kind === 'sit') {
    const dir = localDirection(item.r, 0, 1);
    const v = clamp(profile.hip, 0, fp.d);
    return (profile.places ?? [fp.w / 2]).map((place, index) => {
      const u = clamp(place, 0, fp.w);
      return {
        index,
        pose: profile.low ? 'sit_low' : 'sit',
        ...localToGrid(item, fp, u, v),
        dir,
        surfaceM: profile.seatM,
        behind: profile.back !== false && facesAway(dir),
        u,
        v,
        fp,
        profile,
      };
    });
  }
  const dir =
    profile.axis === 'd'
      ? localDirection(item.r, 0, 1)
      : localDirection(item.r, -1, 0);
  return profile.at.map(([pu, pv], index) => {
    const u = clamp(pu, 0, fp.w);
    const v = clamp(pv, 0, fp.d);
    return {
      index,
      pose: 'lie',
      ...localToGrid(item, fp, u, v),
      dir,
      surfaceM: profile.surfaceM,
      behind: false,
      u,
      v,
      fp,
      profile,
    };
  });
}

/** Les places d'un meuble posé (vide : on ne s'y assoit ni ne s'y allonge). */
export function furnitureSpots(
  item: RoomItem,
  catalog: FurnitureCatalog
): FurnitureSpot[] {
  return localSpots(item, catalog).map(
    ({ u: _u, v: _v, fp: _fp, profile: _p, ...spot }) => spot
  );
}

const tileAt = (p: { x: number; y: number }): Tile => ({
  i: Math.floor(p.x + 1e-9),
  j: Math.floor(p.y + 1e-9),
});

/** Les cases qui bordent l'empreinte (8-voisinage), de la plus proche de `near` à la plus loin. */
function ringTiles(
  item: RoomItem,
  catalog: FurnitureCatalog,
  near: { x: number; y: number }
): Tile[] {
  const b = itemBox(item, specOf(catalog, item.key));
  const out: Tile[] = [];
  for (let j = b.minY - 1; j <= b.maxY; j++)
    for (let i = b.minX - 1; i <= b.maxX; i++)
      if (i < b.minX || i >= b.maxX || j < b.minY || j >= b.maxY)
        out.push({ i, j });
  const dist = (t: Tile) => Math.hypot(t.i + 0.5 - near.x, t.j + 0.5 - near.y);
  return out.sort((a, c) => dist(a) - dist(c));
}

function firstWalkable(
  grid: WalkGrid,
  candidates: readonly Tile[],
  avoid: (t: Tile) => boolean = () => false
): Tile | null {
  const open = candidates.filter((t) => isWalkable(grid, t.i, t.j));
  return open.find((t) => !avoid(t)) ?? open[0] ?? null;
}

/**
 * La case d'accès d'une place : devant elle (un lit : à son côté, puis à son
 * pied), sinon la case libre qui touche le meuble la plus proche ; null si
 * aucune n'est libre.
 */
export function spotAccess(
  item: RoomItem,
  catalog: FurnitureCatalog,
  grid: WalkGrid,
  index: number
): Tile | null {
  const s = localSpots(item, catalog).find((x) => x.index === index);
  if (!s) return null;
  const { u, v, fp } = s;
  const local: [number, number][] = [];
  if (s.profile.kind === 'lie' && s.profile.axis === 'd') {
    const near = u < fp.w / 2 ? -0.5 : fp.w + 0.5;
    local.push([near, v], [fp.w - near, v], [u, fp.d + 0.5]);
  } else {
    local.push([u, fp.d + 0.5]);
  }
  const front = local.map(([lu, lv]) => tileAt(localToGrid(item, fp, lu, lv)));
  return firstWalkable(grid, [...front, ...ringTiles(item, catalog, s)]);
}

/**
 * Où se tenir pour se servir d'un meuble : devant son milieu, sinon la case
 * libre qui le touche la plus proche de son avant. `avoid` : une case déjà
 * prise (gardée en dernier recours).
 */
export function serviceAccess(
  item: RoomItem,
  catalog: FurnitureCatalog,
  grid: WalkGrid,
  avoid?: (t: Tile) => boolean
): Tile | null {
  const fp = specOf(catalog, item.key).footprint;
  const front = localToGrid(item, fp, fp.w / 2, fp.d + 0.5);
  return firstWalkable(
    grid,
    [tileAt(front), ...ringTiles(item, catalog, front)],
    avoid
  );
}

/** Un polygone vertical de la salle (x, y, z) : le bas, puis le haut à rebours. */
export type PanelQuad = readonly (readonly [number, number, number])[];

/** Les deux bouts d'un bord, en retrait de `i` cases vers l'intérieur. */
const EDGE_ENDS: Readonly<
  Record<
    Edge,
    (fp: Footprint, i: number) => [[number, number], [number, number]]
  >
> = {
  v0: (fp, i) => [
    [0, i],
    [fp.w, i],
  ],
  vd: (fp, i) => [
    [0, fp.d - i],
    [fp.w, fp.d - i],
  ],
  u0: (fp, i) => [
    [i, 0],
    [i, fp.d],
  ],
  uw: (fp, i) => [
    [fp.w - i, 0],
    [fp.w - i, fp.d],
  ],
};

/**
 * Les panneaux d'un meuble tournés vers la caméra (sur sa face +x ou +y) :
 * une tête de lit, un dossier, qui passent DEVANT qui s'y allonge. Le
 * renderer redessine le meuble découpé à ces quadrilatères, par-dessus elle.
 */
export function frontPanels(
  item: RoomItem,
  catalog: FurnitureCatalog
): PanelQuad[] {
  const fp = specOf(catalog, item.key).footprint;
  const p = profileOf(item.key, fp);
  if (p?.kind !== 'lie' || !p.panels) return [];
  const b = itemBox(item, specOf(catalog, item.key));
  const out: PanelQuad[] = [];
  for (const { edge, h, inset = 0 } of p.panels) {
    // Le bord lui-même dit s'il est tourné vers la caméra ; le retrait,
    // où passe le panneau du sprite.
    const [e0, e1] = EDGE_ENDS[edge](fp, 0).map(([u, v]) =>
      localToGrid(item, fp, u, v)
    );
    const on = (k: 'x' | 'y', max: number) =>
      Math.abs(e0[k] - max) < 1e-9 && Math.abs(e1[k] - max) < 1e-9;
    if (!on('x', b.maxX) && !on('y', b.maxY)) continue;
    const [a, c] = EDGE_ENDS[edge](fp, inset).map(([u, v]) =>
      localToGrid(item, fp, u, v)
    );
    const hs = typeof h === 'number' ? [h, h] : h;
    const top = hs.map((z, k): readonly [number, number, number] => {
      const t = hs.length > 1 ? k / (hs.length - 1) : 0;
      return [a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t, z];
    });
    out.push([[a.x, a.y, 0], [c.x, c.y, 0], ...top.reverse()]);
  }
  return out;
}

/** Une case touche-t-elle l'empreinte du meuble (ou est-elle dessus) ? */
export function touchesItem(
  item: RoomItem,
  catalog: FurnitureCatalog,
  t: Tile
): boolean {
  const b = itemBox(item, specOf(catalog, item.key));
  return (
    t.i >= b.minX - 1 && t.i <= b.maxX && t.j >= b.minY - 1 && t.j <= b.maxY
  );
}

/** Depuis la case `t`, la direction qui regarde le meuble (son point le plus proche). */
export function faceItem(
  item: RoomItem,
  catalog: FurnitureCatalog,
  t: Tile
): Direction {
  const b = itemBox(item, specOf(catalog, item.key));
  const cx = t.i + 0.5;
  const cy = t.j + 0.5;
  const dir = directionFromDelta(
    clamp(cx, b.minX, b.maxX) - cx,
    clamp(cy, b.minY, b.maxY) - cy
  );
  // Sur l'empreinte (un meuble mural) : face à lui, donc dos à son avant.
  return dir ?? localDirection(item.r, 0, -1);
}
