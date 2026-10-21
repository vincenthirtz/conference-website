// Les POSTURES d'un avatar (lot 15 de docs/PLAN-womens-library.md) : assise
// ou allongée sur une place d'un meuble (`seat`), ou en train de s'en servir
// (`use`). PUR : ce module lit le monde (meubles, grille, autres avatars) et
// rend des décisions ; `LibraryWorld` les applique.
//
//   - un APPUI sur un meuble (`planFurniture`) : la case d'accès où marcher
//     et l'intention à réaliser en arrivant. Une place prise (assise, ou
//     visée par une autre qui y marche) est sautée ; tout est pris : on
//     marche à côté, sans intention ;
//   - l'ARRIVÉE (`settle`) réalise l'intention, si le meuble est toujours là,
//     que l'avatar le touche et que la place est libre — sinon il reste
//     debout (le premier assis garde sa place) ;
//   - un meuble déplacé ou retiré relève qui s'y tenait (`postureValid`, par
//     la signature clé@case,rotation prise en s'asseyant).
// L'avatar reste LOGIQUEMENT sur sa case d'accès (marche, présence) : la
// posture ne change que l'endroit où il est dessiné.

import type { RestPose } from './avatarSprites';
import {
  faceItem,
  furnitureSpots,
  type InteractionKind,
  profileOf,
  spotAccess,
  touchesItem,
  type UseActivity,
  serviceAccess,
} from './interactions';
import { type Direction, walkerTile, type Walker } from './motion';
import type { WalkGrid } from './pathfinding';
import { gridToScreen, type ScreenPoint, type Tile } from './projection';
import {
  type FurnitureCatalog,
  type RoomItem,
  type RoomModel,
  specOf,
} from './room';

/** Ce qu'un avatar fera en arrivant (et ce que dit le réseau). */
export type AvatarIntent =
  | { kind: 'seat'; itemId: string; spot: number }
  | { kind: 'use'; itemId: string };

export type SeatPosture = {
  kind: 'seat';
  itemId: string;
  spot: number;
  pose: RestPose;
  /** Le bassin (coordonnées continues de la salle). */
  x: number;
  y: number;
  dir: Direction;
  surfaceM: number;
  /** Dessinée juste avant son meuble (dos à la caméra). */
  behind: boolean;
  /** `clé@gx,gy,r` du meuble quand elle s'y est installée. */
  sig: string;
};

export type UsePosture = {
  kind: 'use';
  itemId: string;
  activity: UseActivity;
  sig: string;
};

export type Posture = SeatPosture | UsePosture;

/** Ce que l'écran sait de la posture de la joueuse (bouton, réseau). */
export type PlayerPosture =
  | { kind: 'seat'; itemId: string; spot: number; pose: RestPose }
  | { kind: 'use'; itemId: string; activity: UseActivity };

export function publicPosture(p: Posture | null): PlayerPosture | null {
  if (!p) return null;
  return p.kind === 'seat'
    ? { kind: 'seat', itemId: p.itemId, spot: p.spot, pose: p.pose }
    : { kind: 'use', itemId: p.itemId, activity: p.activity };
}

/** La posture comme intention (ce que porte la présence). */
export function intentOf(p: Posture | null): AvatarIntent | null {
  if (!p) return null;
  return p.kind === 'seat'
    ? { kind: 'seat', itemId: p.itemId, spot: p.spot }
    : { kind: 'use', itemId: p.itemId };
}

export function sameIntent(
  a: AvatarIntent | null,
  b: AvatarIntent | null
): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'seat' && b.kind === 'seat')
    return a.itemId === b.itemId && a.spot === b.spot;
  return a.kind === b.kind && a.itemId === b.itemId;
}

type Holder = {
  id: string;
  walker: Walker;
  posture: Posture | null;
  intent: AvatarIntent | null;
};

/** Ce que les décisions lisent du monde. */
export type PostureWorld = {
  room: RoomModel;
  catalog: FurnitureCatalog;
  grid: WalkGrid;
  avatars: readonly Holder[];
};

export const itemSignature = (i: RoomItem) => `${i.key}@${i.gx},${i.gy},${i.r}`;

function itemById(world: PostureWorld, id: string): RoomItem | null {
  return world.room.items.find((i) => i.id === id) ?? null;
}

/** La place est-elle tenue par une autre (assise ; ou visée, avec `intents`) ? */
export function spotTaken(
  world: PostureWorld,
  itemId: string,
  spot: number,
  selfId: string,
  intents: boolean
): boolean {
  return world.avatars.some((a) => {
    if (a.id === selfId) return false;
    const p = a.posture;
    if (p?.kind === 'seat' && p.itemId === itemId && p.spot === spot)
      return true;
    const i = intents ? a.intent : null;
    return i?.kind === 'seat' && i.itemId === itemId && i.spot === spot;
  });
}

export type FurniturePlan = { goal: Tile; intent: AvatarIntent | null };

/**
 * Un appui de `selfId` sur un meuble : la case où aller et l'intention, ou
 * null (aucune case libre autour). Les places libres sont essayées de la plus
 * proche du point visé (`hint`, px du MONDE) à la plus loin.
 */
export function planFurniture(
  world: PostureWorld,
  selfId: string,
  item: RoomItem,
  kind: InteractionKind,
  hint: ScreenPoint | null = null
): FurniturePlan | null {
  const { catalog, grid } = world;
  if (kind !== 'sit' && kind !== 'lie') {
    const others = world.avatars.filter(
      (a) => a.id !== selfId && a.posture?.kind === 'use'
    );
    const goal = serviceAccess(item, catalog, grid, (t) =>
      others.some((a) => {
        const at = walkerTile(a.walker);
        return at.i === t.i && at.j === t.j;
      })
    );
    return goal ? { goal, intent: { kind: 'use', itemId: item.id } } : null;
  }
  const spots = furnitureSpots(item, catalog);
  const dist = (s: (typeof spots)[number]) => {
    if (!hint) return s.index;
    const p = gridToScreen(s.x, s.y, s.surfaceM);
    return Math.hypot(p.x - hint.x, p.y - hint.y);
  };
  const ordered = [...spots].sort((a, b) => dist(a) - dist(b));
  for (const s of ordered) {
    if (spotTaken(world, item.id, s.index, selfId, true)) continue;
    const goal = spotAccess(item, catalog, grid, s.index);
    if (goal)
      return { goal, intent: { kind: 'seat', itemId: item.id, spot: s.index } };
  }
  // Tout est pris : on marche à côté.
  for (const s of ordered) {
    const goal = spotAccess(item, catalog, grid, s.index);
    if (goal) return { goal, intent: null };
  }
  return null;
}

/**
 * L'intention réalisée, ou null : meuble parti, avatar trop loin de lui
 * (plus d'une case), place inconnue ou déjà prise (la première assise la
 * garde).
 */
export function settle(
  world: PostureWorld,
  a: Holder,
  intent: AvatarIntent
): Posture | null {
  const item = itemById(world, intent.itemId);
  if (!item) return null;
  const at = walkerTile(a.walker);
  if (!touchesItem(item, world.catalog, at)) return null;
  const sig = itemSignature(item);
  if (intent.kind === 'use') {
    const p = profileOf(item.key, specOf(world.catalog, item.key).footprint);
    return p?.kind === 'use'
      ? { kind: 'use', itemId: item.id, activity: p.activity, sig }
      : null;
  }
  const spot = furnitureSpots(item, world.catalog).find(
    (s) => s.index === intent.spot
  );
  if (!spot || spotTaken(world, item.id, spot.index, a.id, false)) return null;
  return {
    kind: 'seat',
    itemId: item.id,
    spot: spot.index,
    pose: spot.pose,
    x: spot.x,
    y: spot.y,
    dir: spot.dir,
    surfaceM: spot.surfaceM,
    behind: spot.behind,
    sig,
  };
}

/** La direction à prendre une fois installée (le regard, les pieds, le meuble). */
export function postureDirection(
  world: PostureWorld,
  a: Holder,
  p: Posture
): Direction {
  if (p.kind === 'seat') return p.dir;
  const item = itemById(world, p.itemId);
  return item
    ? faceItem(item, world.catalog, walkerTile(a.walker))
    : a.walker.dir;
}

/** Le meuble est-il toujours là, au même endroit ? */
export function postureValid(world: PostureWorld, p: Posture): boolean {
  const item = itemById(world, p.itemId);
  return !!item && itemSignature(item) === p.sig;
}

/** Une intention en cours vise-t-elle encore un meuble présent ? */
export function intentValid(world: PostureWorld, i: AvatarIntent): boolean {
  return itemById(world, i.itemId) !== null;
}
