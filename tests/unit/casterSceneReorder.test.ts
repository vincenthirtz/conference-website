// tests/unit/casterSceneReorder.test.ts
//
// Diff de persistance du réordonnancement des scènes caster (lot 7) —
// utils/caster/sceneReorder.ts. Deux invariants qui coûtent cher s'ils cassent :
//
//  1. sortOrderUpdates n'écrit QUE les lignes dont le rang change. Chaque UPDATE
//     part en Realtime vers l'app desktop et vers chaque Browser Source OBS
//     ouverte : réécrire 11 lignes pour un « monter d'un cran » spamme
//     l'antenne.
//  2. orderWithDuplicateAfter place la copie juste après son original, et reste
//     idempotent si l'id créé figure déjà dans la liste (course avec le
//     Realtime, qui peut avoir déjà rechargé la liste).

import { describe, expect, it } from 'vitest';

import {
  orderWithDuplicateAfter,
  sortOrderUpdates,
} from '@/utils/caster/sceneReorder';
import { moveInList } from '@/utils/caster/sceneCrud';

/** Liste dense (sort_order = index), l'état normal après un réordonnancement. */
function dense(ids: string[]) {
  return ids.map((id, sort_order) => ({ id, sort_order }));
}

describe('sortOrderUpdates', () => {
  it('rien à écrire quand l’ordre est déjà celui de la base', () => {
    const rows = dense(['a', 'b', 'c']);
    expect(sortOrderUpdates(['a', 'b', 'c'], rows)).toEqual([]);
  });

  it('un échange de voisines n’écrit que les DEUX lignes déplacées', () => {
    const rows = dense(['a', 'b', 'c', 'd', 'e']);
    const next = moveInList(rows, 'd', -1);
    expect(next).not.toBeNull();
    const updates = sortOrderUpdates(
      (next as { id: string }[]).map((r) => r.id),
      rows
    );
    expect(updates).toEqual([
      { id: 'd', sort_order: 2 },
      { id: 'c', sort_order: 3 },
    ]);
  });

  it('normalise des sort_order clairsemés (seed 1..5) en 0-based dense', () => {
    // La table déployée est seedée en 1..5 : le tout premier réordonnancement
    // doit donc bien réécrire toutes les lignes, une seule fois.
    const rows = [
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 2 },
      { id: 'c', sort_order: 3 },
    ];
    expect(sortOrderUpdates(['a', 'b', 'c'], rows)).toEqual([
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ]);
  });

  it('ignore un id absent de la base (ligne supprimée en concurrence)', () => {
    const rows = dense(['a', 'b']);
    const updates = sortOrderUpdates(['a', 'ghost', 'b'], rows);
    // `b` passe bien de 1 à 2 ; `ghost` ne produit aucun UPDATE fantôme.
    expect(updates).toEqual([{ id: 'b', sort_order: 2 }]);
  });

  it('ne mute ni les ids ni les lignes reçues', () => {
    const ids = ['b', 'a'];
    const rows = dense(['a', 'b']);
    sortOrderUpdates(ids, rows);
    expect(ids).toEqual(['b', 'a']);
    expect(rows).toEqual(dense(['a', 'b']));
  });
});

describe('orderWithDuplicateAfter', () => {
  it('insère la copie juste après son original', () => {
    expect(orderWithDuplicateAfter(['a', 'b', 'c'], 'b', 'new')).toEqual([
      'a',
      'b',
      'new',
      'c',
    ]);
  });

  it('copie d’une scène en fin de liste', () => {
    expect(orderWithDuplicateAfter(['a', 'b'], 'b', 'new')).toEqual([
      'a',
      'b',
      'new',
    ]);
  });

  it('idempotent si la copie figure déjà dans la liste (écho Realtime)', () => {
    expect(orderWithDuplicateAfter(['a', 'b', 'new'], 'a', 'new')).toEqual([
      'a',
      'new',
      'b',
    ]);
  });

  it('original introuvable → la copie va en fin de liste (pas de perte)', () => {
    expect(orderWithDuplicateAfter(['a', 'b'], 'gone', 'new')).toEqual([
      'a',
      'b',
      'new',
    ]);
  });
});
