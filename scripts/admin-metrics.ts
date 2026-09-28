// scripts/admin-metrics.ts — indicateurs de dette de l'espace admin (lot L1,
// docs/PLAN-industrialisation-admin.md).
//
// POURQUOI. Le diagnostic du plan a été compté à la main le 2026-09-29 ; le
// lendemain il aurait été faux sans que personne ne le sache. Ce script le
// recompte à partir de la SOURCE (pas de build, < 5 s) et sert deux usages :
//
//   * `tests/unit/adminDebtRatchet.test.ts` compare chaque compteur à sa
//     baseline : un compteur qui MONTE échoue (on n'ajoute plus de dette),
//     un compteur qui BAISSE échoue aussi, avec la commande pour regeler —
//     un gel qui ne descend jamais finit par ne plus rien geler ;
//   * `npm run admin:metrics` affiche le tableau, `-- --write` regèle.
//
// Chaque indicateur est un NOMBRE D'OCCURRENCES OU DE FICHIERS À FAIRE
// BAISSER : plus bas = mieux. Les indicateurs d'adoption (plus haut = mieux)
// sont affichés mais pas gelés — ils montent naturellement avec la migration.

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

export const BASELINE_PATH = 'tests/unit/__fixtures__/admin-debt-baseline.json';

const PAGES = 'pages/admin';
const COMPONENTS = 'components/admin';
const API = 'pages/api/admin';

function walk(dir: string, exts = ['.ts', '.tsx']): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const name of entries) {
    const rel = join(dir, name);
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) out.push(...walk(rel, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const lineCount = (src: string) =>
  src.split('\n').length - (src.endsWith('\n') ? 1 : 0);
const count = (src: string, re: RegExp) => (src.match(re) || []).length;

/**
 * Définition des indicateurs gelés. `scope` = racines lues ; `per` :
 *   - 'match' : somme des occurrences de `re` ;
 *   - 'file'  : nombre de fichiers où `test(src)` est vrai.
 */
type DebtMetric = { key: string; label: string; scope: string[] } & (
  | { per: 'file'; test: (src: string) => boolean }
  | { per: 'match'; re: RegExp }
);

export const DEBT_METRICS: DebtMetric[] = [
  {
    key: 'api.routesNotDeclarative',
    label: 'Routes admin hors defineAdminRoute',
    scope: [API],
    per: 'file',
    // Une route migrée réexporte son module `features/admin/<domaine>/routes`.
    test: (src) =>
      !src.includes('defineAdminRoute(') && !src.includes('@/features/admin/'),
  },
  {
    key: 'api.manualMethodSwitch',
    label: 'Routes admin qui aiguillent req.method à la main',
    scope: [API],
    per: 'file',
    test: (src) => /\breq\.method\b/.test(src),
  },
  {
    key: 'api.directSupabaseAdmin',
    label: 'Routes admin qui importent supabaseAdmin',
    scope: [API],
    per: 'file',
    test: (src) => /\bsupabaseAdmin\b/.test(src),
  },
  {
    key: 'api.selectStar',
    label: "select('*') dans les routes admin",
    scope: [API],
    per: 'match',
    re: /\.select\(\s*['"`]\*['"`]/g,
  },
  {
    key: 'api.reqBodyCast',
    label: 'req.body non validé (as / affectation brute)',
    scope: [API],
    per: 'match',
    re: /req\.body as\b|=\s*req\.body\b/g,
  },
  {
    key: 'api.freeErrorJson',
    label: '.json({ error… }) écrits à la main',
    scope: [API],
    per: 'match',
    re: /\.json\(\{\s*error\b/g,
  },
  {
    key: 'api.adHocSuccessEnvelope',
    label: 'Enveloppes { ok } / { success } ad hoc',
    scope: [API],
    per: 'match',
    re: /\.json\(\{\s*(ok|success)\b/g,
  },
  {
    key: 'api.manualLogStaffAction',
    label: 'Appels manuels à logStaffAction',
    scope: [API],
    per: 'match',
    re: /\blogStaffAction\(/g,
  },
  {
    key: 'api.relativeLoggerImport',
    label: 'Imports relatifs du logger',
    scope: [API],
    per: 'match',
    re: /from ['"](\.\.\/)+utils\/logger['"]/g,
  },
  {
    key: 'ui.pagesImportSupabase',
    label: 'Pages admin qui importent @/utils/supabase',
    scope: [PAGES],
    per: 'file',
    test: (src) => /from ['"]@\/utils\/supabase['"]/.test(src),
  },
  {
    key: 'ui.useState',
    label: 'useState dans pages + composants admin',
    scope: [PAGES, COMPONENTS],
    per: 'match',
    re: /\buseState\b\s*[<(]/g,
  },
  {
    key: 'ui.inlineStyle',
    label: 'style={{…}} inline',
    scope: [PAGES, COMPONENTS],
    per: 'match',
    re: /style=\{\{/g,
  },
  {
    key: 'ui.rawAdminUrl',
    label: "URLs '/api/admin/…' en dur côté UI",
    scope: [PAGES, COMPONENTS],
    per: 'match',
    re: /['"`]\/api\/admin\//g,
  },
];

/** Seuils de taille : nombre de fichiers au-dessus, par zone. */
export const SIZE_METRICS = [
  {
    key: 'size.pagesOver800',
    label: 'Pages admin > 800 lignes',
    scope: [PAGES],
    max: 800,
  },
  {
    key: 'size.componentsOver600',
    label: 'Composants admin > 600 lignes',
    scope: [COMPONENTS],
    max: 600,
  },
  {
    key: 'size.apiOver500',
    label: 'Routes admin > 500 lignes',
    scope: [API],
    max: 500,
  },
];

/** Adoption du socle — affichée, jamais gelée. */
export const ADOPTION_METRICS: [string, string, string[]][] = [
  ['adopt.featureModule', '@/features/admin/', [API]],
  ['adopt.zod', "from 'zod'", [API]],
  ['adopt.idempotency', 'adminIdempotency', [API]],
  ['adopt.dataTable', 'DataTable', [PAGES, COMPONENTS]],
  ['adopt.adminListShell', 'AdminListShell', [PAGES, COMPONENTS]],
  ['adopt.useAdminResource', 'useAdminResource', [PAGES, COMPONENTS]],
  ['adopt.useTableQueryState', 'useTableQueryState', [PAGES, COMPONENTS]],
];

export function collectAdminMetrics() {
  const cache = new Map<string, string>();
  const files = (scope: string[]) => scope.flatMap((d) => walk(d));
  const src = (f: string): string => {
    if (!cache.has(f)) cache.set(f, read(f));
    return cache.get(f) as string;
  };

  const debt: Record<string, number> = {};
  for (const m of DEBT_METRICS) {
    let n = 0;
    for (const f of files(m.scope)) {
      const s = src(f);
      if (m.per === 'file') n += m.test(s) ? 1 : 0;
      else n += count(s, m.re);
    }
    debt[m.key] = n;
  }
  for (const m of SIZE_METRICS) {
    debt[m.key] = files(m.scope).filter(
      (f) => lineCount(src(f)) > m.max
    ).length;
  }

  const adoption: Record<string, number> = {};
  for (const [key, needle, scope] of ADOPTION_METRICS) {
    adoption[key] = files(scope).filter((f) => src(f).includes(needle)).length;
  }

  const loc: Record<string, { files: number; lines: number }> = {};
  for (const [key, dir] of [
    ['pages', PAGES],
    ['components', COMPONENTS],
    ['api', API],
  ]) {
    const fs = walk(dir);
    loc[key] = {
      files: fs.length,
      lines: fs.reduce((a, f) => a + lineCount(src(f)), 0),
    };
  }

  return { debt, adoption, loc };
}

export function readBaseline(): {
  measuredAt: string;
  debt: Record<string, number>;
} {
  return JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), 'utf8'));
}

function labelOf(key: string) {
  return (
    DEBT_METRICS.find((m) => m.key === key)?.label ??
    SIZE_METRICS.find((m) => m.key === key)?.label ??
    key
  );
}

function main() {
  const write = process.argv.includes('--write');
  const { debt, adoption, loc } = collectAdminMetrics();
  let baseline: Record<string, number> = {};
  try {
    baseline = readBaseline().debt ?? {};
  } catch {
    // première exécution : pas encore de baseline
  }

  const rows = Object.entries(debt).map(([k, v]) => {
    const b = baseline[k];
    const delta =
      b === undefined
        ? 'nouveau'
        : v - b === 0
          ? '='
          : v - b > 0
            ? `+${v - b}`
            : `${v - b}`;
    return `| ${labelOf(k)} | ${v} | ${b ?? '—'} | ${delta} |`;
  });
  console.log(
    '| Indicateur (plus bas = mieux) | Mesure | Gel | Écart |\n|---|---|---|---|'
  );
  console.log(rows.join('\n'));
  console.log('\n| Adoption (plus haut = mieux) | Fichiers |\n|---|---|');
  for (const [k, v] of Object.entries(adoption)) console.log(`| ${k} | ${v} |`);
  console.log('\n| Zone | Fichiers | Lignes |\n|---|---|---|');
  for (const [k, v] of Object.entries(loc))
    console.log(`| ${k} | ${v.files} | ${v.lines} |`);

  if (write) {
    const out = { measuredAt: new Date().toISOString().slice(0, 10), debt };
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      `${JSON.stringify(out, null, 2)}\n`
    );
    console.log(
      `\nBaseline réécrite : ${relative(process.cwd(), join(ROOT, BASELINE_PATH))}`
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
