// scripts/db-backup-check.mjs — contrôle d'une sauvegarde de la base avant
// son envoi dans R2 (.github/workflows/db-backup.yml, docs/SAUVEGARDES.md).
//
// Les trois fichiers de `supabase db dump` (roles.sql, schema.sql, data.sql)
// doivent être là, et contenir ce qu'une base vivante contient forcément :
// des tables publiques, des comptes, des matchs. Une sauvegarde vide ou
// tronquée ne doit jamais remplacer silencieusement les bonnes.
//
// N'affiche que des noms de tables et des nombres : jamais de données.
//
// Usage : node scripts/db-backup-check.mjs <dossier>

import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Seuils bas : la base en a bien plus (177 tables publiques le 2026-10-29). */
export const MIN_PUBLIC_TABLES = 100;
export const MIN_TABLES_WITH_DATA = 50;
const REQUIRED_DATA = ['auth.users', 'public.matches', 'public.teams'];

// Noms entre guillemets (`supabase db dump`) ou non (`pg_dump` brut).
const COPY_LINE =
  /^COPY "?([A-Za-z0-9_]+)"?\."?([A-Za-z0-9_]+)"? .*FROM stdin;$/;

/**
 * Lignes de données par table (`schéma.table`), lues dans un dump `--use-copy`.
 * @param {string} data
 * @returns {Map<string, number>}
 */
export function countCopyRows(data) {
  /** @type {Map<string, number>} */
  const rows = new Map();
  /** @type {string | null} */
  let current = null;
  for (const line of data.split('\n')) {
    if (current) {
      if (line === '\\.') current = null;
      else rows.set(current, (rows.get(current) ?? 0) + 1);
      continue;
    }
    const m = COPY_LINE.exec(line);
    if (m) {
      current = `${m[1]}.${m[2]}`;
      rows.set(current, rows.get(current) ?? 0);
    }
  }
  return rows;
}

/** @param {{ roles: string; schema: string; data: string }} files */
export function checkDump({ roles, schema, data }) {
  /** @type {string[]} */
  const problems = [];
  if (!roles.trim()) problems.push('roles.sql est vide');
  const publicTables = (
    schema.match(/^CREATE TABLE (?:IF NOT EXISTS )?"?public"?\./gm) ?? []
  ).length;
  if (publicTables < MIN_PUBLIC_TABLES) {
    problems.push(
      `schema.sql : ${publicTables} tables publiques (minimum ${MIN_PUBLIC_TABLES})`
    );
  }
  const rows = countCopyRows(data);
  const withData = [...rows.values()].filter((n) => n > 0).length;
  if (withData < MIN_TABLES_WITH_DATA) {
    problems.push(
      `data.sql : ${withData} tables avec des lignes (minimum ${MIN_TABLES_WITH_DATA})`
    );
  }
  for (const t of REQUIRED_DATA) {
    if (!((rows.get(t) ?? 0) > 0)) {
      problems.push(`data.sql : aucune ligne dans ${t}`);
    }
  }
  const totalRows = [...rows.values()].reduce((a, b) => a + b, 0);
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      publicTables,
      tablesWithData: withData,
      totalRows,
      accounts: rows.get('auth.users') ?? 0,
      matches: rows.get('public.matches') ?? 0,
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage : node scripts/db-backup-check.mjs <dossier>');
    process.exit(2);
  }
  const files = { roles: '', schema: '', data: '' };
  const sizes = [];
  for (const name of /** @type {const} */ (['roles', 'schema', 'data'])) {
    const p = join(dir, `${name}.sql`);
    try {
      files[name] = readFileSync(p, 'utf8');
      sizes.push(`${name}.sql ${(statSync(p).size / 1024).toFixed(0)} Ko`);
    } catch {
      console.error(`ARRÊT : ${name}.sql introuvable dans ${dir}`);
      process.exit(1);
    }
  }
  const { ok, problems, summary } = checkDump(files);
  const lines = [
    '## Sauvegarde de la base',
    '',
    `- Fichiers : ${sizes.join(', ')}`,
    `- Tables publiques : ${summary.publicTables}`,
    `- Tables avec des lignes : ${summary.tablesWithData} (${summary.totalRows} lignes)`,
    `- Comptes : ${summary.accounts} · matchs : ${summary.matches}`,
    '',
    ok
      ? '**Sauvegarde complète.**'
      : `**Sauvegarde refusée :** ${problems.join(' ; ')}`,
    '',
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  process.exit(ok ? 0 : 1);
}
