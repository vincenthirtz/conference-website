// features/player/library/editing/editor.ts — l'ÉTAT du mode déco et ses
// transitions, en logique PURE (lot 4, phase B) : quel meuble est « fantôme »
// (en cours de pose ou de déplacement), lequel est sélectionné, et la liste
// des meubles posés telle que la joueuse la voit. Le hook
// `useApartmentEditor` l'enregistre ; le moteur ne fait que l'afficher.
//
// UN GESTE N'ABOUTIT QUE S'IL EST VALIDE (`placement.ts`, la géométrie de
// l'API) : poser un fantôme rouge, pivoter ou déplacer d'une case vers un
// chevauchement ne change rien. L'API revérifie de toute façon.
//
// Clavier et pointeur passent par les MÊMES actions (`editorKeyAction`,
// `editorPointerActions`) : chaque geste a son équivalent clavier.

import type { PlacementRoom } from '../placement';
import {
  applyEdit,
  ghostAt,
  ghostIssues,
  pickItemAt,
  rotateGhost,
  type EditItem,
  type GhostReason,
  type Specs,
} from './layout';

type Tile = { i: number; j: number };

/** Le meuble fantôme : sorti de l'inventaire, ou un meuble posé qu'on déplace. */
export type EditorGhost = EditItem & { source: 'inventory' | 'move' };

export type EditorState = {
  items: EditItem[];
  ghost: EditorGhost | null;
  selectedId: string | null;
};

export type EditorContext = { room: PlacementRoom; specs: Specs };

export type EditorAction =
  | { type: 'reset'; items: readonly EditItem[] }
  | { type: 'startPlace'; inventoryId: string; key: string; tile?: Tile | null }
  | { type: 'startMove'; id?: string }
  | { type: 'ghostTo'; tile: Tile }
  | { type: 'ghostBy'; di: number; dj: number }
  | { type: 'rotate' }
  | { type: 'commit' }
  | { type: 'cancel' }
  | { type: 'select'; id: string | null }
  | { type: 'nudge'; di: number; dj: number }
  | { type: 'store'; id?: string }
  | {
      type: 'revert';
      ids: readonly string[];
      baseline: readonly EditItem[];
    };

export function initialEditor(items: readonly EditItem[]): EditorState {
  return { items: items.map((i) => ({ ...i })), ghost: null, selectedId: null };
}

/** La case du milieu de la salle (point de départ d'un meuble au clavier). */
export function centerTile(room: PlacementRoom): Tile {
  return { i: Math.floor(room.width / 2), j: Math.floor(room.depth / 2) };
}

/** Pourquoi le fantôme ne tient pas (vide = il tient). */
export function ghostProblems(
  state: EditorState,
  ctx: EditorContext
): GhostReason[] {
  return state.ghost
    ? ghostIssues(ctx.room, state.items, state.ghost, ctx.specs)
    : [];
}

const isWall = (item: EditItem, ctx: EditorContext) =>
  ctx.specs.get(item.key)?.layer === 'wall';

/** Décalage d'une case ; un meuble mural glisse le long de SON mur. */
function shifted(
  item: EditItem,
  di: number,
  dj: number,
  ctx: EditorContext
): EditItem {
  if (isWall(item, ctx)) {
    const step = di !== 0 ? di : dj;
    return item.rotation === 1
      ? { ...item, gy: item.gy + step }
      : { ...item, gx: item.gx + step };
  }
  return { ...item, gx: item.gx + di, gy: item.gy + dj };
}

/** `next` remplace l'item `id` s'il tient ; sinon l'état ne bouge pas. */
function tryReplace(
  state: EditorState,
  next: EditItem,
  ctx: EditorContext
): EditorState {
  if (ghostIssues(ctx.room, state.items, next, ctx.specs).length > 0)
    return state;
  return {
    ...state,
    items: state.items.map((i) =>
      i.inventoryId === next.inventoryId ? next : i
    ),
  };
}

export function editorReduce(
  state: EditorState,
  action: EditorAction,
  ctx: EditorContext
): EditorState {
  const selected = state.selectedId
    ? (state.items.find((i) => i.inventoryId === state.selectedId) ?? null)
    : null;
  switch (action.type) {
    case 'reset':
      return initialEditor(action.items);
    case 'startPlace': {
      const already = state.items.find(
        (i) => i.inventoryId === action.inventoryId
      );
      if (already)
        return editorReduce(
          state,
          { type: 'startMove', id: already.inventoryId },
          ctx
        );
      const ghost = ghostAt(
        { inventoryId: action.inventoryId, key: action.key, rotation: 0 },
        action.tile ?? centerTile(ctx.room),
        ctx.specs
      );
      return {
        ...state,
        ghost: { ...ghost, source: 'inventory' },
        selectedId: null,
      };
    }
    case 'startMove': {
      const id = action.id ?? state.selectedId;
      const item = state.items.find((i) => i.inventoryId === id);
      if (!item) return state;
      return {
        ...state,
        ghost: { ...item, source: 'move' },
        selectedId: item.inventoryId,
      };
    }
    case 'ghostTo': {
      const g = state.ghost;
      if (!g) return state;
      const next = ghostAt(g, action.tile, ctx.specs);
      if (next.gx === g.gx && next.gy === g.gy && next.rotation === g.rotation)
        return state;
      return { ...state, ghost: { ...next, source: g.source } };
    }
    case 'ghostBy':
      return state.ghost
        ? {
            ...state,
            ghost: {
              ...shifted(state.ghost, action.di, action.dj, ctx),
              source: state.ghost.source,
            },
          }
        : state;
    case 'rotate':
      if (state.ghost)
        return {
          ...state,
          ghost: {
            ...rotateGhost(state.ghost, ctx.specs),
            source: state.ghost.source,
          },
        };
      return selected
        ? tryReplace(state, rotateGhost(selected, ctx.specs), ctx)
        : state;
    case 'commit': {
      const g = state.ghost;
      if (!g || ghostProblems(state, ctx).length > 0) return state;
      const { source: _source, ...item } = g;
      return {
        items: applyEdit(state.items, { type: 'place', item }),
        ghost: null,
        selectedId: item.inventoryId,
      };
    }
    case 'cancel':
      if (state.ghost) return { ...state, ghost: null };
      return state.selectedId ? { ...state, selectedId: null } : state;
    case 'select': {
      const id =
        action.id && state.items.some((i) => i.inventoryId === action.id)
          ? action.id
          : null;
      return { ...state, ghost: null, selectedId: id };
    }
    case 'nudge':
      return selected
        ? tryReplace(state, shifted(selected, action.di, action.dj, ctx), ctx)
        : state;
    case 'store': {
      const id =
        action.id ??
        (state.ghost?.source === 'move' ? state.ghost.inventoryId : null) ??
        state.selectedId;
      if (!id) return state.ghost ? { ...state, ghost: null } : state;
      return {
        items: applyEdit(state.items, { type: 'store', inventoryId: id }),
        ghost: state.ghost?.inventoryId === id ? null : state.ghost,
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }
    case 'revert': {
      const ids = new Set(action.ids);
      const before = new Map(action.baseline.map((i) => [i.inventoryId, i]));
      const kept = state.items.filter((i) => !ids.has(i.inventoryId));
      const restored = [...ids].flatMap((id) => {
        const b = before.get(id);
        return b ? [{ ...b }] : [];
      });
      return {
        items: [...kept, ...restored],
        ghost:
          state.ghost && ids.has(state.ghost.inventoryId) ? null : state.ghost,
        selectedId:
          state.selectedId &&
          ids.has(state.selectedId) &&
          !before.has(state.selectedId)
            ? null
            : state.selectedId,
      };
    }
    default:
      return state;
  }
}

/** Touche du clavier → geste (null : la touche n'est pas pour le mode déco). */
export function editorKeyAction(
  key: string,
  state: EditorState
): EditorAction | null {
  const arrows: Record<string, [number, number]> = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowDown: [0, 1],
    ArrowUp: [0, -1],
  };
  if (Object.hasOwn(arrows, key)) {
    const [di, dj] = arrows[key];
    if (state.ghost) return { type: 'ghostBy', di, dj };
    return state.selectedId ? { type: 'nudge', di, dj } : null;
  }
  switch (key) {
    case 'r':
    case 'R':
      return state.ghost || state.selectedId ? { type: 'rotate' } : null;
    case 'Enter':
      if (state.ghost) return { type: 'commit' };
      return state.selectedId ? { type: 'startMove' } : null;
    case 'Delete':
    case 'Backspace':
      if (state.ghost?.source === 'inventory') return { type: 'cancel' };
      return state.ghost || state.selectedId ? { type: 'store' } : null;
    case 'Escape':
      return state.ghost || state.selectedId ? { type: 'cancel' } : null;
    default:
      return null;
  }
}

/** Ce que le contrôleur signale sous le pointeur (engine/controller.ts). */
export type PointerInfo = {
  kind: 'hover' | 'tap' | 'leave';
  tile: Tile | null;
  itemId: string | null;
  pointerType: string;
};

/**
 * Pointeur → gestes. Souris : le fantôme suit le survol, un clic le pose. Au
 * doigt (pas de survol) : un premier toucher AMÈNE le fantôme sur la case, un
 * second toucher au même endroit le pose. Sans fantôme, un toucher
 * sélectionne le meuble visé (par son image, sinon par sa case), ou
 * désélectionne.
 */
export function editorPointerActions(
  p: PointerInfo,
  state: EditorState,
  ctx: EditorContext
): EditorAction[] {
  const g = state.ghost;
  if (p.kind === 'leave') return [];
  if (p.kind === 'hover')
    return g && p.tile ? [{ type: 'ghostTo', tile: p.tile }] : [];
  if (g) {
    if (!p.tile) return [];
    if (p.pointerType === 'mouse')
      return [{ type: 'ghostTo', tile: p.tile }, { type: 'commit' }];
    const target = ghostAt(g, p.tile, ctx.specs);
    const same =
      target.gx === g.gx &&
      target.gy === g.gy &&
      target.rotation === g.rotation;
    return same ? [{ type: 'commit' }] : [{ type: 'ghostTo', tile: p.tile }];
  }
  const id =
    p.itemId ??
    (p.tile
      ? (pickItemAt(state.items, ctx.specs, p.tile)?.inventoryId ?? null)
      : null);
  return [{ type: 'select', id }];
}
