// scripts/db-direct-reads.mjs — les lectures directes de la base par le site (lot 1d de
// docs/D1-MIGRATION.md).
//
// Le rendu serveur du site lit encore la base lui-même (`.from('table')…` avec la clé de
// service) : le jour du moteur suivant, ces lectures devront passer par la même façade que l'API.
// Ce script les compte, fichier par fichier, dans les sources PROPRES du site (les copies de
// l'API, listées par .api-sync-manifest.json, sont comptées dans conference-api). Il relève aussi
// ce qui ne doit pas exister ici : écriture dans la base, appel de fonction SQL (`.rpc`), code
// d'erreur de la base. Ce que ces lectures demandent au constructeur de requêtes est relevé côté
// API : `npm run db:contract -- --site ../conference-website` (database/db-contract-site.json).
//
//   npm run db:reads              affiche le relevé et l'écart au gel
//   npm run db:reads -- --write   regèle tests/unit/__fixtures__/db-direct-reads.json
//
// Garde-fou : tests/unit/dbDirectReadsGuard.test.ts.

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOTS = [
  'pages',
  'features',
  'utils',
  'lib',
  'components',
  'hooks',
  'cloudflare',
];
export const BASELINE = 'tests/unit/__fixtures__/db-direct-reads.json';

const IGNORED = new Set([
  'node_modules',
  '.next',
  '.open-next',
  '__tests__',
  '__mocks__',
]);

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (IGNORED.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith('.d.ts')
      ? [full]
      : [];
  });
}

/** Le code sans ses commentaires (les chaînes restent). */
/**
 * @param {string} src
 * @returns {string}
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const READ = /\.from\(\s*['"`][A-Za-z_]\w*['"`]\s*\)/g;
const WRITE =
  /\.from\(\s*['"`][^'"`]+['"`]\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/g;
const RPC = /\.rpc\s*\(/g;
// Un SQLSTATE entre guillemets (les classes de Postgres seules : `'10000'` est un nombre), ou un
// code de PostgREST.
const ERROR_CODE =
  /['"`](?:0[0-9A-Z]|2[0-9A-F]|3[489BDF]|4[024]|5[3-8]|72|F0|HV|P0|XX)[0-9A-Z]{3}['"`]|PGRST\d{3}/g;

/** Le relevé des sources propres du site, à la racine `cwd`. */
/** @param {string} cwd */
export function siteDbReads(cwd) {
  const manifest = JSON.parse(
    readFileSync(join(cwd, '.api-sync-manifest.json'), 'utf8')
  );
  const synced = new Set(manifest.files);
  /** @type {Record<string, number>} */
  const reads = {};
  const writes = [];
  const rpc = [];
  const errorCodes = [];
  for (const root of ROOTS) {
    for (const file of walk(join(cwd, root))) {
      const rel = relative(cwd, file).split('\\').join('/');
      if (synced.has(rel) || /\.(test|spec)\.(t|j)sx?$/.test(rel)) continue;
      const src = code(readFileSync(file, 'utf8'));
      const n = (src.match(READ) ?? []).length;
      if (n > 0) reads[rel] = n;
      for (const m of src.match(WRITE) ?? [])
        writes.push(`${rel}: ${m.replace(/\s+/g, ' ')}`);
      if (RPC.test(src)) rpc.push(rel);
      RPC.lastIndex = 0;
      for (const m of src.match(ERROR_CODE) ?? [])
        errorCodes.push(`${rel}: ${m}`);
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(reads).sort(([a], [b]) => a.localeCompare(b))
  );
  return { reads: sorted, writes, rpc, errorCodes };
}

/** @param {Record<string, number>} reads */
export function renderBaseline(reads) {
  const total = Object.values(reads).reduce((sum, n) => sum + n, 0);
  return `${JSON.stringify(
    {
      $commentaire:
        'Lectures directes de la base par fichier, sources propres du site (lot 1d de docs/D1-MIGRATION.md). Regeler : npm run db:reads -- --write',
      total,
      reads,
    },
    null,
    2
  )}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cwd = process.cwd();
  const { reads, writes, rpc, errorCodes } = siteDbReads(cwd);
  const total = Object.values(reads).reduce((sum, n) => sum + n, 0);
  console.log(
    `lectures directes : ${total} dans ${Object.keys(reads).length} fichiers`
  );
  console.log(
    `écritures : ${writes.length}, .rpc : ${rpc.length}, codes d'erreur : ${errorCodes.length}`
  );
  if (process.argv.includes('--write')) {
    writeFileSync(join(cwd, BASELINE), renderBaseline(reads));
    console.log(`→ ${BASELINE} regelé.`);
  } else if (existsSync(join(cwd, BASELINE))) {
    const same =
      readFileSync(join(cwd, BASELINE), 'utf8') === renderBaseline(reads);
    console.log(
      same
        ? `${BASELINE} : à jour.`
        : `${BASELINE} : ÉCART — npm run db:reads -- --write`
    );
  }
}
