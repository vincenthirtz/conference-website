// scripts/db-restore-verify.mjs — vérifie une restauration d'essai de la
// sauvegarde (.github/workflows/db-restore-test.yml, docs/SAUVEGARDES.md).
//
// Pour CHAQUE table présente dans data.sql, le nombre de lignes de la base
// restaurée doit être exactement celui de la sauvegarde. Une seule requête
// (UNION ALL), lancée par psql. N'affiche que des noms de tables et des
// nombres : jamais de données.
//
// Usage : node scripts/db-restore-verify.mjs <dossier> <url de la base jetable>

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { countCopyRows } from './db-backup-check.mjs';

const IDENT = /^[A-Za-z0-9_]+$/;

/**
 * Requête de comptage de toutes les tables (`schéma.table`).
 * @param {string[]} tables
 */
export function countQuery(tables) {
  return tables
    .map((t) => {
      const [schema, table] = t.split('.');
      if (!IDENT.test(schema ?? '') || !IDENT.test(table ?? '')) {
        throw new Error(`nom de table inattendu : ${t}`);
      }
      return `select '${t}', count(*) from "${schema}"."${table}"`;
    })
    .join('\nunion all\n');
}

/**
 * @param {Map<string, number>} expected lignes de la sauvegarde
 * @param {Map<string, number>} actual lignes de la base restaurée
 */
export function compareCounts(expected, actual) {
  /** @type {{ table: string; expected: number; actual: number | null }[]} */
  const mismatches = [];
  let rows = 0;
  for (const [table, n] of expected) {
    rows += n;
    const got = actual.get(table);
    if (got !== n) mismatches.push({ table, expected: n, actual: got ?? null });
  }
  return {
    ok: mismatches.length === 0,
    tables: expected.size,
    rows,
    mismatches,
  };
}

/** @param {string} out sortie `psql -At -F '\t'` */
export function parseCounts(out) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const line of out.split('\n')) {
    const [table, n] = line.split('\t');
    if (table && n !== undefined) counts.set(table, Number(n));
  }
  return counts;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [dir, url] = process.argv.slice(2);
  if (!dir || !url) {
    console.error(
      'Usage : node scripts/db-restore-verify.mjs <dossier> <url de la base>'
    );
    process.exit(2);
  }
  const expected = countCopyRows(readFileSync(join(dir, 'data.sql'), 'utf8'));
  const out = execFileSync(
    'psql',
    [
      url,
      '-At',
      '-F',
      '\t',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      countQuery([...expected.keys()]),
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  const result = compareCounts(expected, parseCounts(out));
  const lines = [
    '## Essai de restauration',
    '',
    `- Tables comparées : ${result.tables} (${result.rows} lignes dans la sauvegarde)`,
    `- Comptes restaurés : ${parseCounts(out).get('auth.users') ?? 0}`,
    result.ok
      ? '- Toutes les tables ont exactement leurs lignes.'
      : `- Écarts : ${result.mismatches
          .slice(0, 20)
          .map((m) => `${m.table} ${m.actual ?? 'absente'}/${m.expected}`)
          .join(', ')}`,
    '',
    result.ok ? '**Restauration réussie.**' : '**Restauration incomplète.**',
    '',
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}
