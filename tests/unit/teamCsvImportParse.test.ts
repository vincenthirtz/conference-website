// Le parser CSV de l'import d'équipes coupait sur `,` ET `;` : dans un CSV à
// virgules, « Alice#1234;Bob#5678 » devenait deux colonnes et Bob disparaissait
// du roster SANS erreur (e2e teams-import). Un seul séparateur par fichier,
// déduit de l'en-tête.

import { describe, it, expect, vi } from 'vitest';

const { importTeams } = vi.hoisted(() => ({
  importTeams: vi.fn(async (rows: unknown[]) => ({
    created: rows.length,
    skipped: 0,
    errors: [],
    teams: [],
  })),
}));
vi.mock('@/utils/supabase', () => ({ supabaseAdmin: {} }));
vi.mock('@/utils/teamImport', async (orig) => ({
  ...(await orig<typeof import('@/utils/teamImport')>()),
  importTeams,
}));

import {
  detectCsvDelimiter,
  importTeamsFromCsv,
  parseCsvLine,
} from '@/features/admin/teams/service/imports';

const ctx = {
  tenantId: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  actor: { kind: 'staff', staffId: 's-1', userId: 'u-1' },
} as never;

function lastRows() {
  return importTeams.mock.calls.at(-1)![0] as { players?: string[] }[];
}

describe('import CSV — séparateurs', () => {
  it('déduit le séparateur de l’en-tête', () => {
    expect(detectCsvDelimiter('name,short_name,joueurs')).toBe(',');
    expect(detectCsvDelimiter('name;short_name;joueurs')).toBe(';');
    expect(detectCsvDelimiter('name\tjoueurs')).toBe('\t');
  });

  it('CSV à virgules : le `;` reste dans la cellule', () => {
    expect(parseCsvLine('A,FR,Alice#1;Bob#2', ',')).toEqual([
      'A',
      'FR',
      'Alice#1;Bob#2',
    ]);
  });

  it('garde toutes les joueuses d’une cellule (virgules)', async () => {
    await importTeamsFromCsv(ctx, {
      csv: 'name,short_name,country,joueurs\nAlpha,A1,FR,Alice#1234;Bob#5678',
    });
    expect(lastRows()[0].players).toEqual(['Alice#1234', 'Bob#5678']);
  });

  it('CSV à `;` (Excel FR), joueuses en dernière colonne : recollées', async () => {
    await importTeamsFromCsv(ctx, {
      csv: 'name;country;joueurs\nAlpha;FR;Alice#1234;Bob#5678',
    });
    expect(lastRows()[0].players).toEqual(['Alice#1234', 'Bob#5678']);
  });
});
