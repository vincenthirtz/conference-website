// features/player/library/editing/layout.ts — le mode déco, en logique PURE
// (lot 4 de docs/PLAN-womens-library.md, phase B) : le « fantôme » d'un meuble
// qu'on pose, sa validité, la rotation, le meuble sous le pointeur, les gestes
// (poser, déplacer, pivoter, ranger). Pas encore branché au moteur.
//
// LA GÉOMÉTRIE EST CELLE DE L'API (`../placement.ts`, copie synchronisée) : un
// fantôme « valide » ici est un placement que `PUT …/apartment/items`
// acceptera, à la case près. Les specs viennent du catalogue de l'API
// (`placementSpecsOf`), pas du manifeste des sprites.

import {
  isAgainstBackWall,
  nextRotation,
  placementIssues,
  placementRect,
  type GeometryReason,
  type PlacementRoom,
  type PlacementRotation,
  type PlacementSpec,
} from '../placement';

/** Un meuble posé, tel que l'API le rend et le reçoit. */
export type EditItem = {
  inventoryId: string;
  key: string;
  gx: number;
  gy: number;
  rotation: number;
};

export type Specs = ReadonlyMap<string, PlacementSpec>;

/** Pourquoi le fantôme ne peut pas être posé là. */
export type GhostReason = GeometryReason | 'unknown_furniture';

/**
 * Les raisons qui empêchent de poser `ghost` dans la salle, compte tenu des
 * autres meubles posés (le fantôme lui-même, s'il y est déjà, est écarté :
 * déplacer un meuble ne le fait pas se heurter à lui-même). Vide = valide.
 */
export function ghostIssues(
  room: PlacementRoom,
  placed: readonly EditItem[],
  ghost: EditItem,
  specs: Specs
): GhostReason[] {
  const spec = specs.get(ghost.key);
  if (!spec) return ['unknown_furniture'];
  const all = [
    ...placed.filter((p) => p.inventoryId !== ghost.inventoryId),
    ghost,
  ];
  const keyOf = new Map(all.map((p) => [p.inventoryId, p.key]));
  return placementIssues(
    room,
    all.map((p) => ({
      id: p.inventoryId,
      gx: p.gx,
      gy: p.gy,
      rotation: p.rotation,
    })),
    (p) => specs.get(keyOf.get(p.id) ?? '') ?? null
  )
    .filter((i) => i.id === ghost.inventoryId)
    .map((i) => i.reason);
}

export function isGhostValid(
  room: PlacementRoom,
  placed: readonly EditItem[],
  ghost: EditItem,
  specs: Specs
): boolean {
  return ghostIssues(room, placed, ghost, specs).length === 0;
}

/**
 * Origine du fantôme quand le pointeur est sur `tile` : l'empreinte TOURNÉE
 * est centrée sur la case visée (arrondi vers l'origine). Un meuble mural se
 * colle au mur du fond le plus proche, dos au mur (rotation 0 le long du mur
 * `gy = 0`, rotation 1 le long du mur `gx = 0`).
 */
export function ghostAt(
  item: Pick<EditItem, 'inventoryId' | 'key' | 'rotation'>,
  tile: { i: number; j: number },
  specs: Specs
): EditItem {
  const spec = specs.get(item.key);
  if (spec?.layer === 'wall') {
    const alongRight = tile.j <= tile.i;
    const rotation: PlacementRotation = alongRight ? 0 : 1;
    const r = placementRect({ gx: 0, gy: 0, rotation }, spec);
    return alongRight
      ? {
          ...item,
          rotation,
          gx: Math.max(0, tile.i - Math.floor((r.maxX - 1) / 2)),
          gy: 0,
        }
      : {
          ...item,
          rotation,
          gx: 0,
          gy: Math.max(0, tile.j - Math.floor((r.maxY - 1) / 2)),
        };
  }
  const r = spec
    ? placementRect({ gx: 0, gy: 0, rotation: item.rotation }, spec)
    : { maxX: 1, maxY: 1 };
  return {
    ...item,
    gx: tile.i - Math.floor((r.maxX - 1) / 2),
    gy: tile.j - Math.floor((r.maxY - 1) / 2),
  };
}

/**
 * Pivoter d'un quart de tour. Un meuble mural change de MUR (il ne peut
 * qu'être dos au mur droit ou au mur gauche) : rotation 0 ↔ 1, et il glisse
 * au pied du mur visé.
 */
export function rotateGhost(ghost: EditItem, specs: Specs): EditItem {
  if (specs.get(ghost.key)?.layer === 'wall') {
    return ghost.rotation === 0
      ? { ...ghost, rotation: 1, gx: 0, gy: ghost.gx }
      : { ...ghost, rotation: 0, gx: ghost.gy, gy: 0 };
  }
  return { ...ghost, rotation: nextRotation(ghost.rotation) };
}

/** Ordre de prise : un objet avant un cadre, un cadre avant un tapis. */
const LAYER_PRIORITY: Record<PlacementSpec['layer'], number> = {
  object: 2,
  wall: 1,
  floor: 0,
};

/**
 * Le meuble sous le pointeur (case de la grille), ou null. Plusieurs calques
 * se superposent : l'objet l'emporte sur le cadre, le cadre sur le tapis ; à
 * calque égal, le dernier de la liste (dessiné par-dessus). Un meuble mural se
 * prend aussi par la case au pied du mur.
 */
export function pickItemAt(
  items: readonly EditItem[],
  specs: Specs,
  tile: { i: number; j: number }
): EditItem | null {
  let best: EditItem | null = null;
  let bestRank = -1;
  for (const item of items) {
    const spec = specs.get(item.key);
    if (!spec) continue;
    const r = placementRect(item, spec);
    const inside =
      tile.i >= r.minX &&
      tile.i < r.maxX &&
      tile.j >= r.minY &&
      tile.j < r.maxY;
    if (!inside) continue;
    const rank = LAYER_PRIORITY[spec.layer];
    if (rank >= bestRank) {
      best = item;
      bestRank = rank;
    }
  }
  return best;
}

/** Un geste du mode déco. */
export type EditAction =
  | { type: 'place'; item: EditItem }
  | { type: 'move'; inventoryId: string; gx: number; gy: number }
  | { type: 'rotate'; inventoryId: string; specs: Specs }
  | { type: 'store'; inventoryId: string };

/**
 * Applique un geste à la liste des meubles posés (nouvelle liste, l'ancienne
 * n'est pas touchée). La VALIDITÉ n'est pas vérifiée ici : l'appelant montre
 * le fantôme rouge et n'appelle `place` / `move` qu'avec un placement valide ;
 * l'API refuse de toute façon un état invalide.
 */
export function applyEdit(
  items: readonly EditItem[],
  action: EditAction
): EditItem[] {
  switch (action.type) {
    case 'place': {
      const rest = items.filter(
        (i) => i.inventoryId !== action.item.inventoryId
      );
      return [...rest, { ...action.item }];
    }
    case 'move':
      return items.map((i) =>
        i.inventoryId === action.inventoryId
          ? { ...i, gx: action.gx, gy: action.gy }
          : i
      );
    case 'rotate':
      return items.map((i) =>
        i.inventoryId === action.inventoryId ? rotateGhost(i, action.specs) : i
      );
    case 'store':
      return items.filter((i) => i.inventoryId !== action.inventoryId);
    default:
      return [...items];
  }
}

/** Un meuble mural est-il bien dos au mur ? (rappel du contrat de l'API) */
export function wallItemOk(item: EditItem, specs: Specs): boolean {
  return specs.get(item.key)?.layer !== 'wall' || isAgainstBackWall(item);
}
