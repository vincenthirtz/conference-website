// Contrôle d'une sauvegarde de la base avant son envoi dans R2
// (scripts/db-backup-check.mjs, docs/SAUVEGARDES.md).
import { describe, expect, it } from 'vitest';
import {
  checkDump,
  countCopyRows,
  MIN_PUBLIC_TABLES,
  MIN_TABLES_WITH_DATA,
} from '../../scripts/db-backup-check.mjs';

const copy = (table: string, rows: number) =>
  [
    `COPY ${table} ("id", "name") FROM stdin;`,
    ...Array.from({ length: rows }, (_, i) => `${i}\tligne`),
    '\\.',
  ].join('\n');

function healthy() {
  const schema = Array.from(
    { length: MIN_PUBLIC_TABLES },
    (_, i) => `CREATE TABLE IF NOT EXISTS "public"."t${i}" (\n  "id" uuid\n);`
  ).join('\n');
  const data = [
    copy('"auth"."users"', 3),
    copy('"public"."matches"', 2),
    copy('"public"."teams"', 1),
    ...Array.from({ length: MIN_TABLES_WITH_DATA }, (_, i) =>
      copy(`"public"."t${i}"`, 1)
    ),
    copy('"public"."vide"', 0),
  ].join('\n');
  return { roles: 'CREATE ROLE "x";', schema, data };
}

describe('countCopyRows', () => {
  it('compte les lignes de chaque bloc COPY, tables vides comprises', () => {
    const rows = countCopyRows(
      [copy('"auth"."users"', 2), copy('"public"."vide"', 0)].join('\n')
    );
    expect(rows.get('auth.users')).toBe(2);
    expect(rows.get('public.vide')).toBe(0);
  });

  it('lit aussi les noms sans guillemets (pg_dump brut)', () => {
    expect(countCopyRows(copy('public.matches', 4)).get('public.matches')).toBe(
      4
    );
  });
});

describe('checkDump', () => {
  it('accepte une sauvegarde complète et la résume sans données', () => {
    const r = checkDump(healthy());
    expect(r.ok).toBe(true);
    expect(r.summary).toEqual({
      publicTables: MIN_PUBLIC_TABLES,
      tablesWithData: MIN_TABLES_WITH_DATA + 3,
      totalRows: 3 + 2 + 1 + MIN_TABLES_WITH_DATA,
      accounts: 3,
      matches: 2,
    });
  });

  it('refuse une sauvegarde vide ou tronquée', () => {
    const r = checkDump({ roles: '', schema: '', data: '' });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/roles\.sql est vide/);
    expect(r.problems.join(' ')).toMatch(/tables publiques/);
    expect(r.problems.join(' ')).toMatch(/aucune ligne dans auth\.users/);
  });

  it('refuse une sauvegarde sans comptes', () => {
    const d = healthy();
    d.data = d.data.replace(/COPY "auth"\."users"[\s\S]*?\n\\\.\n?/, '');
    const r = checkDump(d);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('data.sql : aucune ligne dans auth.users');
  });
});
