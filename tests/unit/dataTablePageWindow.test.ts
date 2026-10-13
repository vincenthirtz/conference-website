// components/admin/DataTable — la pagination numérotée (`pageWindow`).
// Sorti d'adminListQuery.test.ts à la bascule 4e : le contrat des listes
// (utils/admin/listQuery) est testé dans conference-api, la fenêtre de pages
// est une affaire d'affichage.

import { describe, expect, it } from 'vitest';

describe('pageWindow (pagination numérotée de DataTable)', () => {
  it('toutes les pages jusqu’à 7, sinon bords + voisines avec sauts', async () => {
    const { pageWindow } = await import('../../components/admin/DataTable');
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 12)).toEqual([1, null, 4, 5, 6, null, 12]);
    expect(pageWindow(1, 12)).toEqual([1, 2, null, 12]);
    expect(pageWindow(12, 12)).toEqual([1, null, 11, 12]);
  });
});
