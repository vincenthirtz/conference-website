// scripts/bundle-budget.mjs — cliquet sur le JavaScript chargé par chaque page.
//
// POURQUOI. Une régression de ~490 ko a déjà eu lieu sans la moindre erreur :
// un composant client qui importe un util serveur (`supabaseAdmin`, `crypto`)
// embarque le module ET les polyfills Node qu'il tire. Next 16 (Turbopack)
// n'affiche plus les tailles à la fin du build : rien ne le voyait.
//
// Le 2026-09-22, la première mesure a trouvé exactement ce motif, installé
// dans `_app` — donc payé par les 250 pages : navbar → adminLinks →
// `utils/staff` → `utils/supabase`, pour une seule fonction pure. Corrigé en
// sortant `utils/staffRoles.ts`, et c'est ce que les deux vérifications
// ci-dessous empêchent de revenir.
//
// CE QUI EST MESURÉ : pour chaque page, le JS de premier chargement (les
// chunks de `_app` + ceux de la page, dédoublonnés), gzippé, en ko. Les
// chunks chargés à la demande (`dynamic()`) n'y sont pas, par construction.
//
// DEUX RÈGLES :
//   1. Une page ne dépasse pas son gel de plus de TOLERANCE_KB. Le gel vit
//      dans `bundle-budget.json` ; `--update` le réécrit sur la mesure du
//      jour. Une hausse assumée passe donc par un diff relisible.
//   2. Aucun chunk de PREMIER CHARGEMENT ne contient de code qui lit la clé
//      service role. Ce n'est pas une fuite — la valeur n'est pas inlinée
//      côté client — mais c'est la signature certaine d'un module serveur
//      embarqué. Les chunks asynchrones sont exclus exprès : un
//      `await import('@/utils/supabase')` dans une fonction serveur (cf.
//      `utils/apiHelpers`) en crée un, que le client ne charge jamais. La
//      contrepartie : un `dynamic()` qui tirerait un module serveur passerait.
//
// Usage, APRÈS `npm run build` :
//   node scripts/bundle-budget.mjs            # vérifie
//   node scripts/bundle-budget.mjs --update   # regèle sur la mesure du jour

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Marge d'une page sur son gel. Couvre le bruit d'un build à l'autre (Windows
 * et la CI Linux ne produisent pas des chunks identiques à l'octet près) sans
 * laisser passer une vraie dépendance : la plus petite régression qui compte
 * ici, un module serveur, pèse des dizaines de ko.
 */
export const TOLERANCE_KB = 3;

/**
 * Chaînes qui ne peuvent venir que d'un module serveur. Les noms de modules
 * sont effacés du build de production : on reconnaît le code à ce qu'il lit.
 */
export const SERVER_ONLY_MARKERS = ['SUPABASE_SERVICE_ROLE_KEY'];

const BUDGET_FILE = 'bundle-budget.json';

/**
 * Taille gzippée (ko, arrondie) du JS de premier chargement de chaque page.
 * `readSize(file)` rend la taille gzippée d'un chunk en octets.
 *
 * @param {Record<string, string[]>} pagesManifest
 * @param {(file: string) => number} readSize
 * @returns {Record<string, number>}
 */
export function measurePages(pagesManifest, readSize) {
  /** @param {string[] | undefined} files */
  const js = (files) => (files ?? []).filter((f) => f.endsWith('.js'));
  const app = js(pagesManifest['/_app']);
  /** @type {Record<string, number>} */
  const out = {};
  for (const [page, files] of Object.entries(pagesManifest)) {
    if (page.startsWith('/_')) continue;
    const unique = new Set([...app, ...js(files)]);
    let bytes = 0;
    for (const f of unique) bytes += readSize(f);
    out[page] = Math.round(bytes / 1024);
  }
  out['/_app'] = Math.round(
    app.reduce((sum, f) => sum + readSize(f), 0) / 1024
  );
  return out;
}

/**
 * Compare la mesure au gel. Pure : c'est la décision entière, testée à part.
 *
 * - `over` : page au-dessus de son gel + tolérance → échec.
 * - `unfrozen` : page nouvelle, sans gel → signalée, pas bloquante (ajouter
 *   une page ne doit pas rougir la CI ; `--update` la gèlera).
 * - `gone` : gel d'une page qui n'existe plus → signalé.
 * - `under` : page nettement sous son gel → invitation à le baisser.
 *
 * @param {Record<string, number>} measured
 * @param {Record<string, number>} frozen
 */
export function compareBudget(measured, frozen, tolerance = TOLERANCE_KB) {
  /** @type {{ page: string, kb: number, limit: number }[]} */
  const over = [];
  /** @type {{ page: string, kb: number, limit: number }[]} */
  const under = [];
  /** @type {{ page: string, kb: number }[]} */
  const unfrozen = [];
  for (const [page, kb] of Object.entries(measured)) {
    const limit = frozen[page];
    if (limit === undefined) unfrozen.push({ page, kb });
    else if (kb > limit + tolerance) over.push({ page, kb, limit });
    else if (kb < limit - tolerance) under.push({ page, kb, limit });
  }
  const gone = Object.keys(frozen).filter((p) => !(p in measured));
  over.sort((a, b) => b.kb - b.limit - (a.kb - a.limit));
  return { over, under, unfrozen, gone, ok: over.length === 0 };
}

/**
 * Chunks dont le contenu porte un marqueur serveur.
 *
 * @param {{ file: string, content: string }[]} chunks
 * @param {string[]} [markers]
 * @returns {string[]}
 */
export function findServerChunks(chunks, markers = SERVER_ONLY_MARKERS) {
  return chunks
    .filter(({ content }) => markers.some((m) => content.includes(m)))
    .map(({ file }) => file);
}

function main() {
  const root = process.cwd();
  const nextDir = join(root, '.next');
  const manifestPath = join(nextDir, 'build-manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(
      'bundle-budget : pas de .next/build-manifest.json — lancer `npm run build` avant.'
    );
    process.exit(2);
  }
  /** @type {Record<string, string[]>} */
  const pages = JSON.parse(readFileSync(manifestPath, 'utf8')).pages;

  /** @type {Map<string, number>} */
  const cache = new Map();
  /** @param {string} file */
  const readSize = (file) => {
    if (!cache.has(file)) {
      cache.set(file, gzipSync(readFileSync(join(nextDir, file))).length);
    }
    return /** @type {number} */ (cache.get(file));
  };
  const measured = measurePages(pages, readSize);

  const budgetPath = join(root, BUDGET_FILE);
  if (process.argv.includes('--update')) {
    const sorted = Object.fromEntries(
      Object.entries(measured).sort(([a], [b]) => a.localeCompare(b))
    );
    writeFileSync(budgetPath, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(
      `bundle-budget : ${Object.keys(sorted).length} pages gelées dans ${BUDGET_FILE}.`
    );
    return;
  }

  let failed = false;

  const firstLoad = [
    ...new Set(
      Object.values(pages)
        .flat()
        .filter((f) => f.endsWith('.js'))
    ),
  ];
  const chunks = firstLoad.map((file) => ({
    file,
    content: readFileSync(join(nextDir, file), 'utf8'),
  }));
  const serverChunks = findServerChunks(chunks);
  if (serverChunks.length > 0) {
    failed = true;
    const set = new Set(serverChunks);
    const hit = Object.entries(pages)
      .filter(([, files]) => files.some((f) => set.has(f)))
      .map(([p]) => p);
    console.error(
      `✗ Module serveur dans le bundle client (${serverChunks.length} chunks), pages : ${hit.join(', ')}`
    );
    console.error(
      "  Un composant importe `utils/supabase` (ou un util qui l'importe). Le code client passe par `utils/supabaseBrowser` / `utils/staffRoles`."
    );
  }

  const frozen = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const { over, under, unfrozen, gone } = compareBudget(measured, frozen);
  for (const { page, kb, limit } of over) {
    failed = true;
    console.error(
      `✗ ${page} : ${kb} ko (gel ${limit} ko, tolérance ${TOLERANCE_KB})`
    );
  }
  if (unfrozen.length)
    console.log(
      `• Pages sans gel : ${unfrozen.map((u) => `${u.page} (${u.kb} ko)`).join(', ')}`
    );
  if (gone.length)
    console.log(`• Gels de pages disparues : ${gone.join(', ')}`);
  if (under.length)
    console.log(
      `• ${under.length} page(s) nettement sous leur gel — \`--update\` pour verrouiller le gain.`
    );

  const heaviest = Object.entries(measured)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  console.log(
    `_app : ${measured['/_app']} ko. Plus lourdes : ${heaviest.map(([p, kb]) => `${p} ${kb}`).join(', ')}`
  );
  if (failed) {
    console.error(
      '\nBudget dépassé. Si la hausse est voulue : `node scripts/bundle-budget.mjs --update` et committer le diff de bundle-budget.json.'
    );
    process.exit(1);
  }
  console.log('✓ Budget de bundles respecté.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
