// scripts/player-metrics.ts — indicateurs de dette de l'espace joueuse (lot P1,
// docs/PLAN-industrialisation-joueur.md).
//
// Même moteur que `scripts/admin-metrics.ts`, transposé au périmètre joueuse /
// capitaine / manager / coach / supportrice (zones du § 1 du plan). Le SITE
// PUBLIC est hors périmètre : ses pages ne sont pas comptées, même quand elles
// partagent des composants avec l'espace joueuse.
//
//   * `tests/unit/playerDebtRatchet.test.ts` compare chaque compteur à sa
//     baseline : un compteur qui MONTE échoue (on n'ajoute plus de dette),
//     un compteur qui BAISSE échoue aussi, avec la commande pour regeler ;
//   * `npm run player:metrics` affiche le tableau, `-- --write` regèle.
//
// Chaque indicateur gelé est un NOMBRE D'OCCURRENCES OU DE FICHIERS À FAIRE
// BAISSER. Les indicateurs d'adoption (plus haut = mieux) sont affichés mais
// pas gelés — ils montent naturellement avec la migration.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

export const BASELINE_PATH =
  'tests/unit/__fixtures__/player-debt-baseline.json';

/** Pages connectées : joueuse, capitaine, parcours à jeton. */
export const PAGES = [
  'pages/player',
  'pages/team/create.tsx',
  'pages/team/[slug]/edit.tsx',
  'pages/espace-capitaine.tsx',
  'pages/checkin/[token].tsx',
  'pages/invitation/[token].tsx',
  'pages/rejoindre/[token].tsx',
];
export const COMPONENTS = ['components/player'];
/** Composants partagés entre l'espace joueuse et le site public. */
export const SHARED = [
  'components/tcg',
  'components/scrim',
  'components/predictions',
  'components/Team',
  'components/FreePlayers',
  'components/TeamOpenings',
  'components/SoloSignup',
  'components/invitation',
];
export const API_PLAYER = ['pages/api/player'];
export const API_TEAMS = ['pages/api/teams', 'pages/api/team'];
export const API_OTHER = [
  'pages/api/demandes',
  'pages/api/scrims',
  'pages/api/checkin',
  'pages/api/invitations',
  'pages/api/players',
  'pages/api/team-openings',
  'pages/api/tcg',
];
export const API = [...API_PLAYER, ...API_TEAMS, ...API_OTHER];
export const UI = [...PAGES, ...COMPONENTS, ...SHARED];

/** Pages publiques rangées sous un dossier du périmètre : hors périmètre. */
export const EXCLUDED = new Set(['pages/player/[userId].tsx']);

/** Fichiers `.ts`/`.tsx` d'une racine (dossier ou fichier), POSIX. */
export function walk(entry: string, exts = ['.ts', '.tsx']): string[] {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(join(ROOT, entry));
  } catch {
    return [];
  }
  if (!st.isDirectory()) {
    return exts.some((e) => entry.endsWith(e)) && !EXCLUDED.has(entry)
      ? [entry]
      : [];
  }
  return readdirSync(join(ROOT, entry)).flatMap((name) =>
    walk(`${entry}/${name}`, exts)
  );
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const lineCount = (src: string) =>
  src.split('\n').length - (src.endsWith('\n') ? 1 : 0);
const count = (src: string, re: RegExp) => (src.match(re) || []).length;
/** Retire les lignes de commentaire (`//`, `/*`, ` *`). */
const stripComments = (src: string) =>
  src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n');

/** Classe utilitaire Tailwind portant une couleur de palette en dur. */
const TAILWIND_COLOR =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|placeholder|shadow|decoration|accent|caret)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/g;

type DebtMetric = { key: string; label: string; scope: string[] } & (
  | { per: 'file'; test: (src: string) => boolean }
  | { per: 'match'; re: RegExp }
);

export const DEBT_METRICS: DebtMetric[] = [
  {
    key: 'api.routesNotDeclarative',
    label: 'Routes joueuse hors defineSubjectRoute',
    scope: API,
    per: 'file',
    // Une route migrée réexporte son module `features/player/<domaine>/routes`.
    test: (src) =>
      !src.includes('defineSubjectRoute(') &&
      !src.includes('@/features/player/'),
  },
  {
    key: 'api.manualMethodSwitch',
    label: 'Routes qui aiguillent req.method à la main',
    scope: API,
    per: 'file',
    test: (src) => /\breq\.method\b/.test(src),
  },
  {
    key: 'api.withAuthRoute',
    label: 'Routes gardées par withAuthRoute',
    scope: API,
    per: 'file',
    test: (src) => /\bwithAuthRoute\b/.test(src),
  },
  {
    key: 'api.withSubjectRoute',
    label: 'Routes gardées par withSubjectRoute',
    scope: API,
    per: 'file',
    test: (src) => /\bwithSubjectRoute\b/.test(src),
  },
  {
    key: 'api.hasTeamPermission',
    label: 'Routes qui utilisent hasTeamPermission (non scopé)',
    scope: API,
    per: 'file',
    test: (src) => /\bhasTeamPermission\b/.test(src),
  },
  {
    key: 'api.manualCaptainCheck',
    label: 'Routes qui testent captain_id à la main',
    scope: API,
    per: 'file',
    // Toute mention de `captain_id` hors commentaire : comparaison, filtre
    // `.eq('captain_id', …)`, lecture pour décider — autant de droits d'équipe
    // qui court-circuitent `assertTeamPermission`.
    test: (src) => /\bcaptain_id\b/.test(stripComments(src)),
  },
  {
    key: 'api.reqBodyWithoutZod',
    label: 'Routes sans zod qui lisent req.body',
    scope: API,
    per: 'file',
    // Validée = importe zod, OU passe le corps par un schéma partagé
    // (`parseBody(Schema, req.body)` d'utils/player/errors, ou
    // `Schema.safeParse(req.body…)`) — le schéma vit alors dans
    // `features/player/<domaine>/schemas.ts` (P4), la route n'importe pas zod.
    test: (src) =>
      /\breq\.body\b/.test(src) &&
      !/from ['"]zod['"]/.test(src) &&
      !/\bparseBody\(|\.safeParse\(\s*req\.body\b/.test(src),
  },
  {
    key: 'api.reqBodyCast',
    label: 'req.body as',
    scope: API,
    per: 'match',
    re: /req\.body as\b/g,
  },
  {
    key: 'api.directSupabaseAdmin',
    label: 'Routes qui importent supabaseAdmin',
    scope: API,
    per: 'file',
    test: (src) => /\bsupabaseAdmin\b/.test(src),
  },
  {
    key: 'api.selectStar',
    label: "select('*') dans les routes",
    scope: API,
    per: 'match',
    // `'*'` comme `'*, team:teams(…)'` : toutes les colonnes de la table.
    re: /\.select\(\s*['"`]\*/g,
  },
  {
    key: 'api.freeErrorJson',
    label: '.json({ error… }) écrits à la main',
    scope: API,
    per: 'match',
    re: /\.json\(\{\s*error\b/g,
  },
  {
    key: 'ui.useState',
    label: 'useState (pages + components/player + partagés)',
    scope: UI,
    per: 'match',
    re: /\buseState\b\s*[<(]/g,
  },
  {
    key: 'ui.useAdminFetch',
    label: 'Fichiers UI joueuse qui utilisent useAdminFetch',
    scope: UI,
    per: 'file',
    test: (src) => /\buseAdminFetch\b/.test(src),
  },
  {
    key: 'ui.rawApiUrl',
    label: "URLs '/api/…' en dur côté UI",
    scope: UI,
    per: 'match',
    re: /['"`]\/api\//g,
  },
  {
    key: 'ui.importFromApi',
    label: 'Fichiers UI qui importent depuis pages/api (types de handler)',
    scope: UI,
    per: 'file',
    // Alias `@/pages/api/…`, relatif `../../pages/api/…`, ou `../api/…` depuis
    // une page (même résolution que la règle 7 de playerBoundariesGuard).
    test: (src) =>
      /\bfrom\s+['"](?:@\/pages\/|(?:\.\.?\/)+(?:pages\/)?)api\//.test(src),
  },
  {
    key: 'ui.tailwindColor',
    label: 'Classes de couleur Tailwind en dur',
    scope: UI,
    per: 'match',
    re: TAILWIND_COLOR,
  },
  {
    key: 'ui.inlineStyle',
    label: 'style={{…}} inline',
    scope: UI,
    per: 'match',
    re: /style=\{\{/g,
  },
];

/** Seuils de taille : nombre de fichiers au-dessus, par zone. */
export const SIZE_METRICS = [
  {
    key: 'size.pagesOver800',
    label: 'Pages joueuse > 800 lignes',
    scope: PAGES,
    max: 800,
  },
  {
    key: 'size.componentsOver600',
    label: 'Composants joueuse + partagés > 600 lignes',
    scope: [...COMPONENTS, ...SHARED],
    max: 600,
  },
  {
    key: 'size.apiOver500',
    label: 'Routes joueuse > 500 lignes',
    scope: API,
    max: 500,
  },
];

/** Adoption du socle — affichée, jamais gelée. */
export const ADOPTION_METRICS: [string, string, string[]][] = [
  ['adopt.featureModule', '@/features/player/', API],
  ['adopt.defineSubjectRoute', 'defineSubjectRoute', API],
  ['adopt.zod', "from 'zod'", API],
  ['adopt.playerHttp', 'playerHttp', UI],
  ['adopt.useSchemaForm', 'useSchemaForm', UI],
  ['adopt.archetypes', 'features/player/_shared/archetypes', UI],
  ['adopt.ruban', '@/features/ruban', UI],
];

export function collectPlayerMetrics() {
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
  for (const [key, scope] of [
    ['pages', PAGES],
    ['components/player', COMPONENTS],
    ['partagés', SHARED],
    ['api/player', API_PLAYER],
    ['api/teams+team', API_TEAMS],
    ['api autres', API_OTHER],
  ] as [string, string[]][]) {
    const fs = files(scope);
    loc[key] = {
      files: fs.length,
      lines: fs.reduce((a, f) => a + lineCount(src(f)), 0),
    };
  }

  return { debt, adoption, loc };
}

export function readBaseline(): {
  measuredAt: string;
  notes?: unknown;
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
  const { debt, adoption, loc } = collectPlayerMetrics();
  let previous: { debt?: Record<string, number>; notes?: unknown } = {};
  try {
    previous = readBaseline();
  } catch {
    // première exécution : pas encore de baseline
  }
  const baseline = previous.debt ?? {};

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
    // Les notes (écarts expliqués avec le § 1 du plan) survivent au regel.
    const out = {
      measuredAt: new Date().toISOString().slice(0, 10),
      ...(previous.notes ? { notes: previous.notes } : {}),
      debt,
    };
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
