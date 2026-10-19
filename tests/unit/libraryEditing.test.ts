// Women's Library, lot 4 — logique PURE du mode déco (phase B, pas encore
// branchée au moteur) : features/player/library/editing/*. La géométrie est
// celle de l'API (placement.ts synchronisé) : un fantôme « valide » ici est
// un placement que `PUT /api/player/library/apartment/items` accepte.

import { describe, expect, it } from 'vitest';
import {
  applyEdit,
  ghostAt,
  ghostIssues,
  isGhostValid,
  pickItemAt,
  rotateGhost,
  wallItemOk,
  type EditItem,
} from '../../features/player/library/editing/layout';
import {
  changeCount,
  isDirty,
  layoutDiff,
  toSavePayload,
} from '../../features/player/library/editing/diff';
import { placementSpecsOf } from '../../features/player/library/model';
import type { LibraryCatalogItem } from '../../features/player/library/responses';

const item = (
  key: string,
  w: number,
  d: number,
  layer: LibraryCatalogItem['layer'] = 'object',
  category: LibraryCatalogItem['category'] = 'decor'
): LibraryCatalogItem => ({
  key,
  category,
  footprint: { w, d },
  heightM: 1,
  price: 100,
  sittable: false,
  stackable: false,
  layer,
});

const SPECS = placementSpecsOf([
  item('bookshelf', 3, 1),
  item('armchair', 2, 2),
  item('lamp', 1, 2),
  item('rug_red', 6, 4, 'floor', 'rug'),
  item('frame_painting', 2, 1, 'wall'),
]);
const ROOM = { width: 14, depth: 12 };

const placed = (
  inventoryId: string,
  key: string,
  gx: number,
  gy: number,
  rotation = 0
): EditItem => ({ inventoryId, key, gx, gy, rotation });

describe('fantôme : validité', () => {
  const layout = [
    placed('a', 'armchair', 4, 4),
    placed('rug', 'rug_red', 2, 2),
  ];

  it('une case libre est valide ; sur un autre objet, overlap', () => {
    expect(isGhostValid(ROOM, layout, placed('n', 'lamp', 8, 8), SPECS)).toBe(
      true
    );
    expect(ghostIssues(ROOM, layout, placed('n', 'lamp', 5, 5), SPECS)).toEqual(
      ['overlap']
    );
  });

  it('un objet se pose sur un tapis (calques différents)', () => {
    expect(isGhostValid(ROOM, layout, placed('n', 'lamp', 2, 2), SPECS)).toBe(
      true
    );
  });

  it('hors de la salle, ou tourné qui déborde : out_of_bounds', () => {
    expect(
      ghostIssues(ROOM, [], placed('n', 'bookshelf', 12, 0), SPECS)
    ).toEqual(['out_of_bounds']);
    expect(
      ghostIssues(ROOM, [], placed('n', 'bookshelf', 0, 10, 1), SPECS)
    ).toEqual(['out_of_bounds']);
  });

  it('déplacer un meuble ne le heurte pas à sa propre place', () => {
    expect(
      isGhostValid(ROOM, layout, placed('a', 'armchair', 5, 4), SPECS)
    ).toBe(true);
  });

  it('un meuble inconnu du catalogue ne se pose pas', () => {
    expect(ghostIssues(ROOM, [], placed('n', 'trone', 0, 0), SPECS)).toEqual([
      'unknown_furniture',
    ]);
  });

  it('un cadre doit être dos au mur du fond', () => {
    expect(
      isGhostValid(ROOM, [], placed('f', 'frame_painting', 4, 0, 0), SPECS)
    ).toBe(true);
    expect(
      ghostIssues(ROOM, [], placed('f', 'frame_painting', 4, 3, 0), SPECS)
    ).toEqual(['out_of_bounds']);
    expect(wallItemOk(placed('f', 'frame_painting', 0, 5, 1), SPECS)).toBe(
      true
    );
  });
});

describe('fantôme : position et rotation', () => {
  it('centre l’empreinte tournée sur la case visée', () => {
    const g = ghostAt(
      { inventoryId: 'n', key: 'bookshelf', rotation: 0 },
      { i: 6, j: 6 },
      SPECS
    );
    expect(g).toMatchObject({ gx: 5, gy: 6 });
    const t = ghostAt(
      { inventoryId: 'n', key: 'bookshelf', rotation: 1 },
      { i: 6, j: 6 },
      SPECS
    );
    expect(t).toMatchObject({ gx: 6, gy: 5 });
  });

  it('un cadre se colle au mur le plus proche, dos au mur', () => {
    const right = ghostAt(
      { inventoryId: 'f', key: 'frame_painting', rotation: 3 },
      { i: 8, j: 3 },
      SPECS
    );
    expect(right).toMatchObject({ gx: 8, gy: 0, rotation: 0 });
    const left = ghostAt(
      { inventoryId: 'f', key: 'frame_painting', rotation: 0 },
      { i: 2, j: 7 },
      SPECS
    );
    expect(left).toMatchObject({ gx: 0, gy: 7, rotation: 1 });
    expect(wallItemOk(right, SPECS) && wallItemOk(left, SPECS)).toBe(true);
  });

  it('pivoter : quart de tour ; un cadre change de mur', () => {
    expect(rotateGhost(placed('n', 'lamp', 3, 3, 3), SPECS).rotation).toBe(0);
    expect(
      rotateGhost(placed('f', 'frame_painting', 6, 0, 0), SPECS)
    ).toMatchObject({ gx: 0, gy: 6, rotation: 1 });
    expect(
      rotateGhost(placed('f', 'frame_painting', 0, 6, 1), SPECS)
    ).toMatchObject({ gx: 6, gy: 0, rotation: 0 });
  });
});

describe('meuble sous le pointeur', () => {
  const layout = [
    placed('rug', 'rug_red', 0, 0),
    placed('chair', 'armchair', 1, 1),
    placed('frame', 'frame_painting', 4, 0),
  ];

  it('l’objet l’emporte sur le tapis, le cadre sur le tapis', () => {
    expect(pickItemAt(layout, SPECS, { i: 1, j: 1 })?.inventoryId).toBe(
      'chair'
    );
    expect(pickItemAt(layout, SPECS, { i: 4, j: 0 })?.inventoryId).toBe(
      'frame'
    );
    expect(pickItemAt(layout, SPECS, { i: 5, j: 3 })?.inventoryId).toBe('rug');
  });

  it('rien sous une case vide', () => {
    expect(pickItemAt(layout, SPECS, { i: 12, j: 11 })).toBeNull();
  });
});

describe('gestes et enregistrement', () => {
  const before = [placed('a', 'armchair', 4, 4), placed('l', 'lamp', 0, 0)];

  it('poser, déplacer, pivoter, ranger : une nouvelle liste à chaque geste', () => {
    let items = applyEdit(before, {
      type: 'place',
      item: placed('s', 'bookshelf', 8, 0),
    });
    items = applyEdit(items, { type: 'move', inventoryId: 'a', gx: 6, gy: 6 });
    items = applyEdit(items, {
      type: 'rotate',
      inventoryId: 'l',
      specs: SPECS,
    });
    expect(before).toHaveLength(2);
    expect(items).toEqual([
      placed('a', 'armchair', 6, 6),
      placed('l', 'lamp', 0, 0, 1),
      placed('s', 'bookshelf', 8, 0),
    ]);
    items = applyEdit(items, { type: 'store', inventoryId: 'l' });
    expect(items.map((i) => i.inventoryId)).toEqual(['a', 's']);
  });

  it('le diff compte placés, déplacés, pivotés, rangés', () => {
    const after = [
      placed('a', 'armchair', 5, 4),
      placed('s', 'bookshelf', 8, 0),
    ];
    const diff = layoutDiff(before, after);
    expect(diff).toEqual({
      placed: ['s'],
      moved: ['a'],
      rotated: [],
      stored: ['l'],
    });
    expect(changeCount(diff)).toBe(3);
    expect(isDirty(before, before)).toBe(false);
    expect(
      layoutDiff(before, [placed('a', 'armchair', 4, 4, 2), before[1]]).rotated
    ).toEqual(['a']);
  });

  it('le corps du PUT : la version lue et l’état complet', () => {
    expect(toSavePayload(7, before)).toEqual({
      version: 7,
      items: [
        { inventoryId: 'a', gx: 4, gy: 4, rotation: 0 },
        { inventoryId: 'l', gx: 0, gy: 0, rotation: 0 },
      ],
    });
  });
});
