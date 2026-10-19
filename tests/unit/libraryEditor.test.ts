// Women's Library, lot 4 phase B — l'état du mode déco et ses transitions
// (features/player/library/editing/editor.ts) : un geste n'aboutit que s'il
// est valide (géométrie de l'API), et clavier et pointeur produisent les
// mêmes gestes.

import { describe, expect, it } from 'vitest';
import {
  centerTile,
  editorKeyAction,
  editorPointerActions,
  editorReduce,
  ghostProblems,
  initialEditor,
  type EditorAction,
  type EditorContext,
  type EditorState,
} from '../../features/player/library/editing/editor';
import { placementSpecsOf } from '../../features/player/library/model';
import type { LibraryCatalogItem } from '../../features/player/library/responses';

const f = (
  key: string,
  w: number,
  d: number,
  layer: LibraryCatalogItem['layer'] = 'object'
): LibraryCatalogItem => ({
  key,
  category: 'decor',
  footprint: { w, d },
  heightM: 1,
  price: 100,
  sittable: false,
  stackable: false,
  layer,
});

const CTX: EditorContext = {
  room: { width: 14, depth: 12 },
  specs: placementSpecsOf([
    f('lamp', 1, 2),
    f('armchair', 2, 2),
    f('rug', 6, 4, 'floor'),
    f('frame', 2, 1, 'wall'),
  ]),
};
const LAMP = { inventoryId: 'lamp-1', key: 'lamp', gx: 1, gy: 1, rotation: 0 };

const run = (state: EditorState, ...actions: EditorAction[]) =>
  actions.reduce((s, a) => editorReduce(s, a, CTX), state);

describe('poser depuis l’inventaire', () => {
  it('le fantôme part du centre ; valide, il se pose et reste sélectionné', () => {
    let s = run(initialEditor([LAMP]), {
      type: 'startPlace',
      inventoryId: 'chair-1',
      key: 'armchair',
    });
    expect(centerTile(CTX.room)).toEqual({ i: 7, j: 6 });
    expect(s.ghost).toMatchObject({ gx: 7, gy: 6, source: 'inventory' });
    expect(ghostProblems(s, CTX)).toEqual([]);
    s = run(s, { type: 'commit' });
    expect(s.ghost).toBeNull();
    expect(s.selectedId).toBe('chair-1');
    expect(s.items.map((i) => i.inventoryId)).toEqual(['lamp-1', 'chair-1']);
  });

  it('un fantôme rouge ne se pose pas', () => {
    const s = run(
      initialEditor([LAMP]),
      { type: 'startPlace', inventoryId: 'chair-1', key: 'armchair' },
      { type: 'ghostTo', tile: { i: 1, j: 2 } }
    );
    expect(ghostProblems(s, CTX)).toEqual(['overlap']);
    expect(run(s, { type: 'commit' })).toBe(s);
  });

  it('un meuble déjà posé, choisi dans l’inventaire, est repris (déplacement)', () => {
    const s = run(initialEditor([LAMP]), {
      type: 'startPlace',
      inventoryId: 'lamp-1',
      key: 'lamp',
    });
    expect(s.ghost).toMatchObject({ source: 'move', gx: 1, gy: 1 });
  });

  it('un cadre glisse le long de son mur aux flèches', () => {
    const s = run(
      initialEditor([]),
      {
        type: 'startPlace',
        inventoryId: 'f',
        key: 'frame',
        tile: { i: 5, j: 0 },
      },
      { type: 'ghostBy', di: 0, dj: 1 }
    );
    expect(s.ghost).toMatchObject({ gx: 6, gy: 0, rotation: 0 });
    expect(ghostProblems(s, CTX)).toEqual([]);
  });
});

describe('sélection : déplacer, pivoter, ranger', () => {
  const selected = run(initialEditor([LAMP]), { type: 'select', id: 'lamp-1' });

  it('déplacer d’une case n’aboutit que si c’est valide', () => {
    expect(
      run(selected, { type: 'nudge', di: 1, dj: 0 }).items[0]
    ).toMatchObject({
      gx: 2,
    });
    const atEdge = run(
      selected,
      { type: 'nudge', di: -1, dj: 0 },
      { type: 'nudge', di: -1, dj: 0 }
    );
    expect(atEdge.items[0].gx).toBe(0);
  });

  it('pivoter un meuble qui déborderait est refusé', () => {
    const corner = run(initialEditor([{ ...LAMP, gx: 13, gy: 0 }]), {
      type: 'select',
      id: 'lamp-1',
    });
    // 1 × 2 tourné devient 2 × 1 : il sortirait par la droite.
    expect(run(corner, { type: 'rotate' }).items[0].rotation).toBe(0);
    expect(run(selected, { type: 'rotate' }).items[0].rotation).toBe(1);
  });

  it('ranger retire de la salle et désélectionne', () => {
    const s = run(selected, { type: 'store' });
    expect(s.items).toEqual([]);
    expect(s.selectedId).toBeNull();
  });

  it('reprendre puis annuler laisse le meuble à sa place', () => {
    const s = run(
      selected,
      { type: 'startMove' },
      { type: 'ghostBy', di: 3, dj: 3 },
      { type: 'cancel' }
    );
    expect(s.items).toEqual([LAMP]);
    expect(s.ghost).toBeNull();
  });
});

describe('revert après un refus de l’API', () => {
  it('un meuble posé reprend sa place, un meuble nouveau retourne à l’inventaire', () => {
    const edited = run(
      initialEditor([LAMP]),
      { type: 'select', id: 'lamp-1' },
      { type: 'nudge', di: 4, dj: 4 },
      { type: 'startPlace', inventoryId: 'chair-1', key: 'armchair' },
      { type: 'commit' }
    );
    const s = run(edited, {
      type: 'revert',
      ids: ['lamp-1', 'chair-1'],
      baseline: [LAMP],
    });
    expect(s.items).toEqual([LAMP]);
    expect(s.selectedId).toBeNull();
  });
});

describe('clavier → gestes', () => {
  const none = initialEditor([LAMP]);
  const sel = run(none, { type: 'select', id: 'lamp-1' });
  const ghost = run(none, {
    type: 'startPlace',
    inventoryId: 'c',
    key: 'armchair',
  });

  it.each([
    ['ArrowRight', ghost, { type: 'ghostBy', di: 1, dj: 0 }],
    ['ArrowUp', sel, { type: 'nudge', di: 0, dj: -1 }],
    ['r', sel, { type: 'rotate' }],
    ['Enter', ghost, { type: 'commit' }],
    ['Enter', sel, { type: 'startMove' }],
    ['Delete', sel, { type: 'store' }],
    ['Delete', ghost, { type: 'cancel' }],
    ['Escape', sel, { type: 'cancel' }],
  ] as const)('%s', (key, state, action) => {
    expect(editorKeyAction(key, state)).toEqual(action);
  });

  it('rien de sélectionné : les touches ne font rien', () => {
    for (const key of ['ArrowLeft', 'r', 'Enter', 'Delete', 'Escape', 'a'])
      expect(editorKeyAction(key, none)).toBeNull();
  });
});

describe('pointeur → gestes', () => {
  const ghost = run(initialEditor([LAMP]), {
    type: 'startPlace',
    inventoryId: 'c',
    key: 'armchair',
  });
  const at = (
    kind: 'hover' | 'tap' | 'leave',
    i: number,
    j: number,
    pointerType = 'mouse',
    itemId: string | null = null
  ) => ({ kind, tile: { i, j }, itemId, pointerType });

  it('souris : le fantôme suit le survol, un clic le pose', () => {
    expect(editorPointerActions(at('hover', 3, 3), ghost, CTX)).toEqual([
      { type: 'ghostTo', tile: { i: 3, j: 3 } },
    ]);
    expect(editorPointerActions(at('tap', 3, 3), ghost, CTX)).toEqual([
      { type: 'ghostTo', tile: { i: 3, j: 3 } },
      { type: 'commit' },
    ]);
  });

  it('doigt : premier toucher amène, second toucher au même endroit pose', () => {
    expect(editorPointerActions(at('tap', 10, 8, 'touch'), ghost, CTX)).toEqual(
      [{ type: 'ghostTo', tile: { i: 10, j: 8 } }]
    );
    const moved = run(ghost, { type: 'ghostTo', tile: { i: 10, j: 8 } });
    expect(editorPointerActions(at('tap', 10, 8, 'touch'), moved, CTX)).toEqual(
      [{ type: 'commit' }]
    );
  });

  it('sans fantôme : toucher sélectionne le meuble visé (image, sinon case), ou rien', () => {
    const none = initialEditor([LAMP]);
    expect(editorPointerActions(at('tap', 1, 2, 'touch'), none, CTX)).toEqual([
      { type: 'select', id: 'lamp-1' },
    ]);
    expect(
      editorPointerActions(at('tap', 9, 9, 'mouse', 'lamp-1'), none, CTX)
    ).toEqual([{ type: 'select', id: 'lamp-1' }]);
    expect(editorPointerActions(at('tap', 9, 9), none, CTX)).toEqual([
      { type: 'select', id: null },
    ]);
    expect(editorPointerActions(at('hover', 9, 9), none, CTX)).toEqual([]);
  });
});
