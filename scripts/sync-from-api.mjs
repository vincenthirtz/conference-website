#!/usr/bin/env node
// scripts/sync-from-api.mjs
//
// Synchro INVERSÉE : conference-api est la source de vérité de tout le
// backend (routes, métier, contrats, utils de domaine). Les fichiers que les
// pages du site importent aussi lui APPARTIENNENT et sont recopiés d'ici —
// on ne les édite jamais côté site.
//
// Comment un fichier est reconnu comme « appartenant à l'API » : il est
// atteint par la fermeture d'imports du site (pages hors pages/api,
// composants, hooks, fonctions Netlify, middleware, scripts, tests) ET il
// existe dans conference-api sous l'un de ses dossiers de code
// (`API_DIRS`). Le manifeste `.api-sync-manifest.json` fige la liste du
// dernier passage : un fichier qui en sort est supprimé ici, un fichier qui y
// entre est copié.
//
//   node scripts/sync-from-api.mjs [chemin/vers/conference-api] [--check]
//
// `--check` (à blanc) : ne touche à rien, imprime ce qui serait copié, ce qui
// diffère, ce qui manquerait — et sort en erreur si la copie n'est pas à
// jour. C'est le mode de la CI avant suppression côté site (étape 3 du plan,
// README de conference-api).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const site = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const api = path.resolve(
  args.find((a) => !a.startsWith('--')) ??
    path.join(site, '..', 'conference-api')
);
if (!fs.existsSync(path.join(api, 'pages', 'api'))) {
  console.error(`conference-api introuvable : ${api}`);
  process.exit(1);
}

// Dossiers de code de l'API : un fichier du site qui y a un homonyme est
// à elle. `pages/api` n'en fait pas partie : le site ne l'importe plus
// (tests/unit/apiTypeImportsGuard.test.ts) et ne le recopie pas.
const API_DIRS = ['utils', 'lib', 'features', 'config', 'types', 'components'];
// Points d'entrée du site : tout ce qui n'est pas l'API. Pas les tests : ceux
// qui exercent des routes partent avec elles (ils tournent déjà dans
// conference-api), et ceux du code partagé n'atteignent rien que les pages
// n'atteignent pas. Une garde vérifie à part qu'aucun test ne sort du
// manifeste.
const SITE_ENTRY_DIRS = ['pages', 'components', 'hooks', 'netlify', 'scripts'];
const SITE_ENTRY_FILES = ['proxy.ts', 'middleware.ts'];
const MANIFEST = path.join(site, '.api-sync-manifest.json');

const readJsonc = (f) =>
  JSON.parse(
    fs
      .readFileSync(f, 'utf8')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1')
  );
const aliases =
  readJsonc(path.join(site, 'tsconfig.json')).compilerOptions?.paths ?? {};
const EXTS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];
const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

const rel = (f) => path.relative(site, f).split(path.sep).join('/');
const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name === '.next') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

function resolve(from, spec) {
  const cands = [];
  if (spec.startsWith('.')) cands.push(path.resolve(path.dirname(from), spec));
  else
    for (const [k, targets] of Object.entries(aliases)) {
      const prefix = k.replace('*', '');
      if (k.endsWith('*') ? spec.startsWith(prefix) : spec === k)
        for (const t of targets)
          cands.push(
            path.join(site, t.replace('*', spec.slice(prefix.length)))
          );
    }
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
    for (const e of EXTS)
      if (fs.existsSync(c + e)) return path.normalize(c + e);
  }
  return null;
}

// Fermeture du site. Les entrées sous pages/api sont exclues : elles partent.
const entries = [
  ...SITE_ENTRY_DIRS.flatMap((d) => walk(path.join(site, d))).filter(
    (f) => !rel(f).startsWith('pages/api/')
  ),
  ...SITE_ENTRY_FILES.map((f) => path.join(site, f)).filter((f) =>
    fs.existsSync(f)
  ),
].filter((f) => /\.(tsx?|jsx?|mjs|cjs)$/.test(f));
const seen = new Set();
const stack = [...entries];
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(f)) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(IMPORT_RE)) {
    const r = resolve(f, m[1] || m[2] || m[3] || m[4]);
    // On ne traverse jamais pages/api : c'est l'API elle-même, pas du partagé.
    if (r && !rel(r).startsWith('pages/api/')) stack.push(r);
  }
}

// Ce qui appartient à l'API : atteint par le site ET présent chez elle.
const owned = [];
const missingAtApi = [];
for (const f of seen) {
  const r = rel(f);
  if (!API_DIRS.some((d) => r.startsWith(`${d}/`))) continue;
  const src = path.join(api, r);
  if (fs.existsSync(src)) owned.push(r);
}
owned.sort();
const previous = fs.existsSync(MANIFEST)
  ? (JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).files ?? [])
  : [];
for (const r of previous)
  if (!owned.includes(r) && !fs.existsSync(path.join(api, r)))
    missingAtApi.push(r);

const normalize = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');
const differs = owned.filter((r) => {
  const a = fs.readFileSync(path.join(api, r));
  const s = fs.existsSync(path.join(site, r))
    ? fs.readFileSync(path.join(site, r))
    : null;
  return s === null || normalize(a) !== normalize(s);
});
const removed = previous.filter((r) => !owned.includes(r));

const byDir = {};
for (const r of owned) {
  const k = r.split('/').slice(0, 2).join('/');
  byDir[k] = (byDir[k] ?? 0) + 1;
}
let apiSha = 'inconnu';
try {
  apiSha = execFileSync('git', ['-C', api, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
} catch {}

console.log(
  `fermeture du site : ${seen.size} fichiers ; appartenant à l'API : ${owned.length} (conference-api @ ${apiSha.slice(0, 9)})`
);
console.log(
  Object.entries(byDir)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([k, n]) => `${n} ${k}`)
    .join(' | ')
);
console.log(
  `à copier (absents ou différents ici) : ${differs.length}` +
    (differs.length ? `\n  ${differs.slice(0, 30).join('\n  ')}` : '')
);
if (removed.length)
  console.log(
    `sortis du manifeste (seraient supprimés ici) : ${removed.length}\n  ${removed.slice(0, 20).join('\n  ')}`
  );
if (missingAtApi.length)
  console.log(
    `⚠ dans le manifeste mais absents de conference-api : ${missingAtApi.length}\n  ${missingAtApi.join('\n  ')}`
  );

if (check) {
  const dirty = differs.length + removed.length + missingAtApi.length;
  console.log(
    dirty
      ? `✗ à blanc : ${dirty} écart(s)`
      : '✓ à blanc : la copie est à jour, rien à faire'
  );
  process.exit(dirty ? 2 : 0);
}

for (const r of differs) {
  const dst = path.join(site, r);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(api, r), dst);
}
for (const r of removed) fs.rmSync(path.join(site, r), { force: true });
fs.writeFileSync(
  MANIFEST,
  `${JSON.stringify({ apiCommit: apiSha, syncedAt: new Date().toISOString(), files: owned }, null, 2)}\n`
);
console.log(
  `synchro : ${differs.length} copié(s), ${removed.length} supprimé(s), manifeste ${owned.length} fichiers`
);
