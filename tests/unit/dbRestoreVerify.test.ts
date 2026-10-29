// Vérification d'une restauration d'essai (scripts/db-restore-verify.mjs,
// docs/SAUVEGARDES.md).
import { describe, expect, it } from 'vitest';
import {
  compareCounts,
  countQuery,
  parseCounts,
} from '../../scripts/db-restore-verify.mjs';

describe('countQuery', () => {
  it('compte chaque table en une seule requête, noms entre guillemets', () => {
    expect(countQuery(['auth.users', 'public.matches'])).toBe(
      `select 'auth.users', count(*) from "auth"."users"\nunion all\nselect 'public.matches', count(*) from "public"."matches"`
    );
  });

  it('refuse un nom inattendu', () => {
    expect(() => countQuery(['public.x"; drop table y; --'])).toThrow(
      /nom de table inattendu/
    );
    expect(() => countQuery(['sansschema'])).toThrow(/nom de table inattendu/);
  });
});

describe('compareCounts', () => {
  const expected = new Map([
    ['auth.users', 3],
    ['public.matches', 2],
    ['public.vide', 0],
  ]);

  it('réussit quand chaque table a exactement ses lignes', () => {
    const r = compareCounts(
      expected,
      parseCounts('auth.users\t3\npublic.matches\t2\npublic.vide\t0\n')
    );
    expect(r).toEqual({ ok: true, tables: 3, rows: 5, mismatches: [] });
  });

  it('signale une table incomplète ou absente', () => {
    const r = compareCounts(
      expected,
      parseCounts('auth.users\t3\npublic.matches\t1\n')
    );
    expect(r.ok).toBe(false);
    expect(r.mismatches).toEqual([
      { table: 'public.matches', expected: 2, actual: 1 },
      { table: 'public.vide', expected: 0, actual: null },
    ]);
  });
});
