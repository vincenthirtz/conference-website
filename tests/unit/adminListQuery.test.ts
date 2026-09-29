// utils/admin/listQuery.ts — le contrat des listes admin serveur (lot L13).

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  adminListQuery,
  listRange,
  searchOrFilter,
} from '../../utils/admin/listQuery';

const Q = adminListQuery({
  sortable: ['last_name', 'created_at'],
  pageSize: 50,
  filters: { role: z.enum(['member', 'board']).optional() },
});

describe('adminListQuery', () => {
  it('applique les défauts', () => {
    expect(Q.parse({})).toEqual({ dir: 'asc', page: 1, pageSize: 50 });
  });

  it('lit une URL (chaînes) en types', () => {
    expect(
      Q.parse({
        q: '  alice ',
        sort: 'created_at',
        dir: 'desc',
        page: '3',
        pageSize: '10',
        role: 'board',
      })
    ).toEqual({
      q: 'alice',
      sort: 'created_at',
      dir: 'desc',
      page: 3,
      pageSize: 10,
      role: 'board',
    });
  });

  it('refuse un tri hors de la liste fermée, une page < 1, une taille > 100', () => {
    expect(Q.safeParse({ sort: 'password_hash' }).success).toBe(false);
    expect(Q.safeParse({ page: '0' }).success).toBe(false);
    expect(Q.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(Q.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('une recherche vide vaut « pas de recherche »', () => {
    expect(Q.parse({ q: '   ' }).q).toBeUndefined();
  });
});

describe('listRange', () => {
  it('bornes inclusives de la page', () => {
    expect(listRange({ page: 1, pageSize: 25 })).toEqual([0, 24]);
    expect(listRange({ page: 3, pageSize: 50 })).toEqual([100, 149]);
  });
});

describe('searchOrFilter', () => {
  it('cite la valeur : points et virgules permis (un email se cherche enfin)', () => {
    expect(searchOrFilter('a.b@x.fr', ['email', 'last_name'])).toBe(
      'email.ilike."%a.b@x.fr%",last_name.ilike."%a.b@x.fr%"'
    );
  });

  it('retire jokers, guillemets et antislashs saisis', () => {
    expect(searchOrFilter('50%_off"\\*', ['c'])).toBe('c.ilike."%50off%"');
  });
});
