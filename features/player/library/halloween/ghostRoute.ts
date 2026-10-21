// features/player/library/halloween/ghostRoute.ts — LA RONDE du fantôme
// d'Halloween dans le hall (lot 16 de docs/PLAN-womens-library.md).
//
// UNE POSITION CALCULÉE À PARTIR DE L'HEURE. Le fantôme suit une boucle fixe
// entre quelques points du hall, avec une pause à chacun, à 0,8 m/s. Sa
// position à l'instant t ne dépend QUE de t (horloge murale, en ms) : toutes
// les joueuses le voient au même endroit, sans serveur ni message. Rien
// d'aléatoire à l'exécution ; le seul calcul préalable (les chemins A* entre
// les points) part de données figées — le décor fixe du hall, ses citrouilles
// et le catalogue de l'API (`config/library/furniture`, copie synchronisée,
// identique pour toutes) — et donne donc le même trajet partout.
//
// LE TRAJET. Entre deux points, le chemin est celui de `engine/pathfinding`
// (A*, 8 voisins, sans couper les coins) sur une grille bâtie comme
// `engine/room.buildWalkGrid`, citrouilles comprises, où les cases au pied des
// portes sont en plus bloquées (le fantôme ne passe pas dans l'encadrement).
// Il flotte, mais reste sur des cases libres : il ne traverse pas un canapé.
// Il NE BLOQUE PAS la marche : il n'est dans aucune grille des joueuses.
//
// CE QUE REND `halloweenGhostAt(now)` : la position continue (coordonnées de
// grille, le centre de la case (i, j) étant (i + 0,5, j + 0,5)), la direction
// écran (0..7, `engine/motion.ts`), la hauteur de vol (m) et la phase de son
// balancement, et s'il est en pause. Le moteur dessine l'image de la
// direction, à cette hauteur, et une ombre douce au sol.
//
// IMPORTS DE VALEUR DU MOTEUR (A*, grille, directions) : ce module ne
// s'importe que depuis le chunk du moteur (chargé à la demande), jamais
// depuis l'écran du hall ni les zones. `./event.ts` et `./hallDecor.ts`,
// eux, restent sans moteur.

import { getFurniture } from '@/config/library/furniture';
import { type Direction, directionFromDelta } from '../engine/motion';
import { findPath, type WalkGrid } from '../engine/pathfinding';
import { metersToTiles, type Tile } from '../engine/projection';
import {
  buildWalkGrid,
  type FurnitureCatalog,
  type RoomModel,
} from '../engine/room';
import { DOOR_SPAN, HALL_DOORS, HALL_ROOM } from '../layouts/hall';
import { isHalloweenActive } from './event';
import { HALLOWEEN_HALL_ITEMS } from './hallDecor';

/** Vitesse de croisière : 0,8 m/s (une avatar marche à 1,3 m/s). */
export const GHOST_SPEED_MPS = 0.8;
/** La même, en cases par seconde (1,6). */
export const GHOST_SPEED = metersToTiles(GHOST_SPEED_MPS);
/**
 * Hauteur de vol moyenne (m) : le bas du drap au-dessus du sol. Assez pour
 * que son ombre se voie sous lui (vérifié dans le moteur, lot 16).
 */
export const GHOST_HOVER_M = 0.35;
/** Amplitude du balancement (m) autour de la hauteur de vol. */
export const GHOST_BOB_M = 0.06;
/** Période du balancement (s). */
export const GHOST_BOB_PERIOD_S = 2.4;

/** Un point de la ronde : sa case, la pause qu'il y fait, où il regarde. */
export type GhostWaypoint = {
  tile: Tile;
  pauseS: number;
  /** Direction écran pendant la pause ; défaut : celle de son arrivée. */
  face?: Direction;
};

/**
 * La ronde, dans l'ordre (elle reboucle sur le premier point). Elle passe
 * par les citrouilles et la porte d'entrée — là où arrivent les joueuses —,
 * le panneau d'annonces, le fond du hall côté QG, puis l'avant de la salle.
 */
export const HALL_GHOST_WAYPOINTS: readonly GhostWaypoint[] = [
  // À côté des citrouilles, qu'il regarde (vers la gauche de l'écran).
  { tile: { i: 5, j: 13 }, pauseS: 4, face: 6 },
  // À côté de l'arrivée, tourné vers la porte d'entrée.
  { tile: { i: 2, j: 11 }, pauseS: 4, face: 7 },
  // Devant le panneau d'annonces, qu'il lit.
  { tile: { i: 8, j: 3 }, pauseS: 3, face: 1 },
  // Devant le banc du fond, côté QG : il se tourne vers la salle.
  { tile: { i: 19, j: 3 }, pauseS: 3, face: 4 },
  // L'avant droit de la salle, après le second salon.
  { tile: { i: 25, j: 17 }, pauseS: 3, face: 6 },
  // L'avant de la salle, sous le salon : face à la caméra.
  { tile: { i: 13, j: 18 }, pauseS: 3, face: 4 },
];

/** Un point continu de la grille (cases). */
export type GridPoint = { x: number; y: number };

type PauseLeg = {
  kind: 'pause';
  t0: number;
  t1: number;
  at: GridPoint;
  dir: Direction;
};

type MoveLeg = {
  kind: 'move';
  t0: number;
  t1: number;
  /** Centres des cases du chemin, départ et arrivée compris. */
  points: GridPoint[];
  /** Distance cumulée (cases) jusqu'à chaque point. */
  cum: number[];
  /** Direction de chaque arête (points[k] → points[k + 1]). */
  dirs: Direction[];
};

export type GhostLeg = PauseLeg | MoveLeg;

export type GhostRoute = {
  legs: readonly GhostLeg[];
  /** Durée d'un tour (s). */
  period: number;
  /** Longueur d'un tour (cases). */
  length: number;
  /** Vitesse (cases/s). */
  speed: number;
  /** Les cases parcourues (chemins A* bout à bout, sans doublon de jonction). */
  tiles: readonly Tile[];
};

/** Ce que le moteur dessine du fantôme à un instant. */
export type GhostPose = {
  x: number;
  y: number;
  dir: Direction;
  /** Hauteur de vol (m), balancement compris. */
  z: number;
  /** Phase du balancement, radians dans [0, 2π). */
  bob: number;
  paused: boolean;
};

const center = (t: Tile): GridPoint => ({ x: t.i + 0.5, y: t.j + 0.5 });

/**
 * Le catalogue du moteur pour les meubles d'une salle, tiré de celui de
 * l'API (empreinte, hauteur, calque) : le même pour toutes les joueuses.
 */
export function apiCatalogFor(room: RoomModel): FurnitureCatalog {
  const out: FurnitureCatalog = {};
  for (const { key } of room.items) {
    if (Object.hasOwn(out, key)) continue;
    const f = getFurniture(key);
    if (!f) continue;
    out[key] = f.layer
      ? { footprint: f.footprint, height: f.heightM, layer: f.layer }
      : { footprint: f.footprint, height: f.heightM };
  }
  return out;
}

/** Les cases au pied des portes du hall (celles du mur, côté salle). */
export function hallDoorFootTiles(): Tile[] {
  const out: Tile[] = [];
  for (const door of Object.values(HALL_DOORS))
    for (let k = door.at; k < door.at + DOOR_SPAN; k++)
      out.push(door.side === 'right' ? { i: k, j: 0 } : { i: 0, j: k });
  return out;
}

/** Le hall pendant l'événement : son décor fixe et ses citrouilles. */
export const HALLOWEEN_HALL_ROOM: RoomModel = {
  ...HALL_ROOM,
  items: [...HALL_ROOM.items, ...HALLOWEEN_HALL_ITEMS],
};

/**
 * La grille du fantôme : celle de la marche (citrouilles comprises), plus le
 * pied des portes. `catalog` : défaut, celui de l'API.
 */
export function hallGhostGrid(
  catalog: FurnitureCatalog = apiCatalogFor(HALLOWEEN_HALL_ROOM)
): WalkGrid {
  const grid = buildWalkGrid(HALLOWEEN_HALL_ROOM, catalog);
  for (const t of hallDoorFootTiles()) grid.blocked[t.j * grid.w + t.i] = 1;
  return grid;
}

function moveLeg(t0: number, path: Tile[], speed: number): MoveLeg {
  const points = path.map(center);
  const cum = [0];
  const dirs: Direction[] = [];
  for (let k = 1; k < points.length; k++) {
    const dx = points[k].x - points[k - 1].x;
    const dy = points[k].y - points[k - 1].y;
    cum.push(cum[k - 1] + Math.hypot(dx, dy));
    dirs.push(directionFromDelta(dx, dy) ?? 4);
  }
  return {
    kind: 'move',
    t0,
    t1: t0 + cum[cum.length - 1] / speed,
    points,
    cum,
    dirs,
  };
}

/**
 * La ronde complète : une pause à chaque point, puis le chemin A* jusqu'au
 * suivant (le dernier rejoint le premier). Null si un point est bloqué ou
 * injoignable : sans trajet sûr, pas de fantôme (jamais d'exception).
 */
export function buildGhostRoute(
  grid: WalkGrid,
  waypoints: readonly GhostWaypoint[] = HALL_GHOST_WAYPOINTS,
  speed: number = GHOST_SPEED
): GhostRoute | null {
  const n = waypoints.length;
  if (n < 2 || !(speed > 0)) return null;
  const paths: Tile[][] = [];
  for (let k = 0; k < n; k++) {
    const path = findPath(grid, waypoints[k].tile, waypoints[(k + 1) % n].tile);
    // findPath accepte un DÉPART bloqué : chaque point doit être libre.
    if (!path || grid.blocked[path[0].j * grid.w + path[0].i]) return null;
    paths.push(path);
  }
  const legs: GhostLeg[] = [];
  const tiles: Tile[] = [];
  let t = 0;
  let length = 0;
  for (let k = 0; k < n; k++) {
    const wp = waypoints[k];
    // Arrivée sur ce point : la dernière arête du chemin qui y mène.
    const prev = paths[(k + n - 1) % n];
    const [a, b] = prev.slice(-2);
    const arrival: Direction =
      (b && directionFromDelta(b.i - a.i, b.j - a.j)) ?? 4;
    const pauseS = Math.max(0, wp.pauseS);
    if (pauseS > 0) {
      legs.push({
        kind: 'pause',
        t0: t,
        t1: t + pauseS,
        at: center(wp.tile),
        dir: wp.face ?? arrival,
      });
      t += pauseS;
    }
    const leg = moveLeg(t, paths[k], speed);
    if (leg.t1 > leg.t0) {
      legs.push(leg);
      t = leg.t1;
      length += leg.cum[leg.cum.length - 1];
    }
    tiles.push(...paths[k].slice(0, -1));
  }
  if (!(t > 0)) return null;
  return { legs, period: t, length, speed, tiles };
}

/** Le point et la direction d'un trajet, à `d` cases de son départ. */
function alongMove(leg: MoveLeg, d: number): { at: GridPoint; dir: Direction } {
  const last = leg.points.length - 1;
  for (let k = 1; k <= last; k++) {
    if (d <= leg.cum[k] || k === last) {
      const span = leg.cum[k] - leg.cum[k - 1];
      const f =
        span > 0 ? Math.min(1, Math.max(0, (d - leg.cum[k - 1]) / span)) : 1;
      const a = leg.points[k - 1];
      const b = leg.points[k];
      return {
        at: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        dir: leg.dirs[k - 1],
      };
    }
  }
  return { at: leg.points[last], dir: leg.dirs[leg.dirs.length - 1] ?? 4 };
}

const TAU = 2 * Math.PI;

/** La phase de balancement et la hauteur de vol à `seconds` (heure absolue). */
export function ghostHover(seconds: number): { bob: number; z: number } {
  const turns = seconds / GHOST_BOB_PERIOD_S;
  const bob = (turns - Math.floor(turns)) * TAU;
  return { bob, z: GHOST_HOVER_M + GHOST_BOB_M * Math.sin(bob) };
}

/**
 * Le fantôme d'une ronde à l'heure `nowMs` (ms depuis l'époque Unix) : le
 * temps de la ronde est `nowMs` modulo sa période, le balancement suit
 * l'heure absolue (il ne saute pas quand la ronde reboucle).
 */
export function ghostPoseAt(route: GhostRoute, nowMs: number): GhostPose {
  const seconds = nowMs / 1000;
  const t = ((seconds % route.period) + route.period) % route.period;
  const hover = ghostHover(seconds);
  let leg = route.legs[route.legs.length - 1];
  for (const l of route.legs)
    if (t < l.t1) {
      leg = l;
      break;
    }
  if (leg.kind === 'pause')
    return { ...leg.at, dir: leg.dir, ...hover, paused: true };
  const { at, dir } = alongMove(leg, (t - leg.t0) * route.speed);
  return { ...at, dir, ...hover, paused: false };
}

let hallRoute: GhostRoute | null | undefined;

/** La ronde du hall (calculée une fois, à la première demande). */
export function hallGhostRoute(): GhostRoute | null {
  if (hallRoute === undefined) hallRoute = buildGhostRoute(hallGhostGrid());
  return hallRoute;
}

/**
 * Le fantôme du hall à `nowMs`, ou null hors de l'événement (ou sans trajet
 * sûr). À appeler à chaque image : c'est une recherche dans ~12 étapes.
 */
export function halloweenGhostAt(nowMs: number): GhostPose | null {
  if (!isHalloweenActive(nowMs)) return null;
  const route = hallGhostRoute();
  return route ? ghostPoseAt(route, nowMs) : null;
}
