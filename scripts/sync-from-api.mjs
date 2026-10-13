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
// composants, hooks, fonctions Netlify, middleware, scripts) ET il existe
// dans conference-api sous l'un de ses dossiers de code (`API_DIRS`). Un
// import qui ne se résout pas côté site est résolu chez elle : un fichier
// qu'elle vient d'ajouter est ainsi rapatrié au premier passage. Le manifeste
// `.api-sync-manifest.json` fige la liste du dernier passage : un fichier qui
// en sort est supprimé ici, un fichier qui y entre est copié.
//
//   node scripts/sync-from-api.mjs [chemin/vers/conference-api] [--check]
//
// `--check` (à blanc) : ne touche à rien, imprime ce qui serait copié, ce qui
// diffère, ce qui manquerait — et sort en erreur si la copie n'est pas à
// jour. C'est le mode de la CI.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

// Dossiers de code de l'API : un fichier du site qui y a un homonyme est à
// elle. `pages/api` n'en fait pas partie : le site ne l'importe plus
// (tests/unit/apiTypeImportsGuard.test.ts) et ne le recopie pas.
const API_DIRS = ['utils', 'lib', 'features', 'config', 'types', 'components'];
// Points d'entrée du site : tout ce qui n'est pas l'API. Pas les tests : ceux
// qui exercent des routes sont partis avec elles, et ceux du code partagé
// n'atteignent rien que les pages n'atteignent pas.
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

const toRel = (root, abs) => path.relative(root, abs).split(path.sep).join('/');
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

/** Résout `spec` importé par `fromRel` dans l'arbre `root` ; chemin relatif ou null. */
function resolveIn(root, fromRel, spec) {
  const cands = [];
  if (spec.startsWith('.'))
    cands.push(path.resolve(path.dirname(path.join(root, fromRel)), spec));
  else
    for (const [k, targets] of Object.entries(aliases)) {
      const prefix = k.replace('*', '');
      if (k.endsWith('*') ? spec.startsWith(prefix) : spec === k)
        for (const t of targets)
          cands.push(
            path.join(root, t.replace('*', spec.slice(prefix.length)))
          );
    }
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return toRel(root, c);
    for (const e of EXTS)
      if (fs.existsSync(c + e)) return toRel(root, path.normalize(c + e));
  }
  return null;
}
/** D'abord le site, sinon conference-api (dossiers de code seulement). */
function resolve(fromRel, spec) {
  const inSite = resolveIn(site, fromRel, spec);
  if (inSite) return { rel: inSite, where: 'site' };
  const inApi = resolveIn(api, fromRel, spec);
  if (inApi && API_DIRS.some((d) => inApi.startsWith(`${d}/`)))
    return { rel: inApi, where: 'api' };
  return null;
}

// Fermeture du site, en chemins relatifs. pages/api est parti (sauf
// internal/, propre au site) ; on ne traverse jamais pages/api : c'est l'API
// elle-même, pas du partagé.
const entries = [
  ...SITE_ENTRY_DIRS.flatMap((d) => walk(path.join(site, d)))
    .map((f) => toRel(site, f))
    .filter(
      (r) => !r.startsWith('pages/api/') || r.startsWith('pages/api/internal/')
    ),
  ...SITE_ENTRY_FILES.filter((f) => fs.existsSync(path.join(site, f))),
].filter((r) => /\.(tsx?|jsx?|mjs|cjs)$/.test(r));
// Un fichier que l'API possède est lu dans SA version : c'est elle qui sera
// copiée, et ses imports peuvent viser un fichier que le site n'a pas encore
// (2026-10-13 : `utils/botEvents.ts` importait un `utils/outboxActivity.ts`
// tout neuf ; lu côté site, l'ancienne copie ne le citait pas, le fichier
// n'était pas rapatrié et le typecheck de la synchro tombait).
const ownedByApi = (rel) =>
  API_DIRS.some((d) => rel.startsWith(`${d}/`)) &&
  fs.existsSync(path.join(api, rel));
const seen = new Map(); // rel → 'site' | 'api'
const stack = entries.map((r) => ({ rel: r, where: 'site' }));
while (stack.length) {
  const { rel, where } = stack.pop();
  if (seen.has(rel)) continue;
  seen.set(rel, where);
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(rel)) continue;
  const abs = path.join(where === 'api' || ownedByApi(rel) ? api : site, rel);
  for (const m of fs.readFileSync(abs, 'utf8').matchAll(IMPORT_RE)) {
    const hit = resolve(rel, m[1] || m[2] || m[3] || m[4]);
    if (hit && !hit.rel.startsWith('pages/api/')) stack.push(hit);
  }
}

// Ce qui appartient à l'API : atteint par le site ET présent chez elle.
const owned = [...seen.keys()]
  .filter(
    (r) =>
      API_DIRS.some((d) => r.startsWith(`${d}/`)) &&
      fs.existsSync(path.join(api, r))
  )
  .sort();
const previous = fs.existsSync(MANIFEST)
  ? (JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).files ?? [])
  : [];
const missingAtApi = previous.filter(
  (r) => !owned.includes(r) && !fs.existsSync(path.join(api, r))
);

const normalize = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');
const differs = owned.filter((r) => {
  const a = fs.readFileSync(path.join(api, r));
  const sitePath = path.join(site, r);
  const s = fs.existsSync(sitePath) ? fs.readFileSync(sitePath) : null;
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
