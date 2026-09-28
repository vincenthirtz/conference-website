// Fraîcheur des types Supabase générés — lot L5
// (docs/PLAN-industrialisation-admin.md).
//
// `types/database.generated.ts` type les lignes lues par les modules
// `features/admin`. Périmé, il ment : une colonne ajoutée est « inconnue » au
// typecheck, une colonne retirée compile encore — exactement le trou que ces
// types doivent fermer.
//
// Référence : `database/schema-snapshot.json`, déjà tenu à jour après chaque
// migration (`node scripts/refresh-schema-snapshot.mjs`) et déjà vérifié par
// `supabaseSelectSchema`. Ce test compare table par table les colonnes des
// deux sources. En cas d'écart : régénérer les types (generate_typescript_types
// sur le projet `owwomenscup`) et remplacer le corps du fichier.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

/** Colonnes de `Row` par table/vue, lues dans la source générée. */
function generatedColumns(): Record<string, string[]> {
  const src = readFileSync(
    resolve(ROOT, 'types/database.generated.ts'),
    'utf8'
  );
  const lines = src.split('\n');
  const out: Record<string, string[]> = {};
  let current: string | null = null;
  let inRow = false;
  for (const line of lines) {
    const table = /^ {6}([a-z0-9_]+): \{$/.exec(line);
    if (table) {
      current = table[1];
      inRow = false;
      continue;
    }
    if (current && /^ {8}Row: \{$/.test(line)) {
      inRow = true;
      out[current] = [];
      continue;
    }
    if (inRow && /^ {8}\}$/.test(line)) {
      inRow = false;
      continue;
    }
    const col = inRow ? /^ {10}([a-z0-9_]+)\??:/.exec(line) : null;
    if (col && current) out[current].push(col[1]);
  }
  return out;
}

const snapshot: { tables: Record<string, string[]> } = JSON.parse(
  readFileSync(resolve(ROOT, 'database/schema-snapshot.json'), 'utf8')
);

describe('types/database.generated.ts', () => {
  const generated = generatedColumns();

  it('le parseur lit bien le fichier (sinon ce test ne vérifierait rien)', () => {
    expect(Object.keys(generated).length).toBeGreaterThan(100);
    expect(generated.free_players).toContain('share_across_tenants');
  });

  it('couvre les mêmes tables que le schéma de référence', () => {
    const missing = Object.keys(snapshot.tables)
      .filter((t) => !generated[t])
      .sort();
    expect(
      missing,
      'tables présentes en base mais absentes des types : régénérer'
    ).toEqual([]);
  });

  it('a les mêmes colonnes, table par table', () => {
    const drift: string[] = [];
    for (const [table, cols] of Object.entries(snapshot.tables)) {
      const gen = new Set(generated[table] ?? []);
      const ref = new Set(cols);
      for (const c of ref)
        if (!gen.has(c)) drift.push(`${table}.${c} absente des types`);
      for (const c of gen)
        if (!ref.has(c)) drift.push(`${table}.${c} absente de la base`);
    }
    expect(drift, 'types périmés : régénérer').toEqual([]);
  });
});
