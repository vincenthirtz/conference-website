// Règles de frontière de l'espace joueuse — lot P2
// (docs/PLAN-industrialisation-joueur.md § 2, docs/adr/0002-player-feature-modules.md).
//
// Règles 1 à 6 : celles de l'ADR 0001 (`adminBoundariesGuard.test.ts`),
// transposées à `features/player/<domaine>/`. Règles 7 à 10 : la dette propre
// à l'espace joueuse, GELÉE fichier par fichier — un nouveau contrevenant
// échoue, et un contrevenant corrigé doit sortir de sa liste (le gel ne
// descend pas tout seul). Puis deux gardes de bundle / de design :
//
//   * le bundle joueuse n'importe pas `features/admin` (le kit commun vit
//     dans `features/ruban/`, lot P7) ;
//   * garde « iso » : aucune brique « Le Ruban » n'est DÉFINIE hors du kit
//     `features/ruban/` (espace joueuse ET admin ; `features/admin/_shared/ui`
//     n'y est qu'un ré-export de compatibilité) — elle naît dans le kit.
//
// Ce test lit la SOURCE. Le site public est hors périmètre.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { API, UI, walk } from '../../scripts/player-metrics.ts';

const ROOT = path.resolve(__dirname, '../..');
const FEATURES = 'features/player';

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function importsOf(src: string): string[] {
  const out: string[] = [];
  const re =
    /(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

const stripComments = (src: string) =>
  src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n');

/** Chemin POSIX cible d'un import (alias `@/` ou relatif), sinon null. */
function resolveSpec(fromRel: string, spec: string): string | null {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (spec.startsWith('.'))
    return path.posix.normalize(
      path.posix.join(path.posix.dirname(fromRel), spec)
    );
  return null;
}

/** Module propriétaire : `features/player/<module>/…`. */
const moduleOf = (rel: string) => {
  const p = rel.split('/');
  return p[0] === 'features' && p[1] === 'player' ? p[2] : null;
};

function featureTarget(fromRel: string, spec: string) {
  const t = resolveSpec(fromRel, spec);
  if (!t) return null;
  const p = t.split('/');
  if (p[0] !== 'features' || p[1] !== 'player' || !p[2]) return null;
  return { module: p[2], rest: p.slice(3).join('/') };
}

const isUi = (rel: string) => rel.split('/').includes('ui');
const isService = (rel: string) => /\/service(\.ts|\/)/.test(rel);
const isRepository = (rel: string) => /\/repository(\.ts|\/)/.test(rel);
const isRoutes = (rel: string) => /\/routes(\.ts|\/)/.test(rel);
const isServerLayer = (rel: string) =>
  isService(rel) || isRepository(rel) || isRoutes(rel);

const features = walk(FEATURES).map((rel) => ({ rel, src: read(rel) }));

/** UI de l'espace joueuse : pages connectées, composants, couche client des modules. */
const uiFiles = [
  ...UI.flatMap((r) => walk(r)),
  ...features.map((f) => f.rel).filter((rel) => !isServerLayer(rel)),
].map((rel) => ({ rel, src: read(rel) }));

/** Dette gelée des règles 7 à 9 — ne peut que DÉCROÎTRE. */
const FROZEN = {
  // Règle 7 — types de réponse importés depuis le fichier handler.
  importsPagesApi: [
    'components/player/AgendaCard.tsx',
    'components/player/MatchPrepCard.tsx',
    'components/player/MyScrimsCard.tsx',
    'components/player/NetworkOnboardingCard.tsx',
    'components/player/RegistrationDeadlineBanner.tsx',
    'components/player/SupporterWelcomeCard.tsx',
    'components/player/TeamHealthCard.tsx',
    'components/player/TeamMemoryCard.tsx',
    'components/player/TeamRegistrationCard.tsx',
    'components/player/TeamRhythmCard.tsx',
    'components/player/WelcomeGiftCard.tsx',
    'components/player/screens/PlayerDashboardScreen.tsx',
    'components/player/screens/PlayerMyTeamsScreen.tsx',
    'components/player/screens/PlayerNotificationsScreen.tsx',
    'pages/player/scouting/[teamId].tsx',
    'pages/player/teams.tsx',
  ],
  // Règle 8 — appels `/api/admin/*` depuis l'UI joueuse (hors commentaire) :
  // nombre d'appels par fichier.
  // À ZÉRO depuis P10 : `admin/teams/my` → `/api/player/team`.
  callsAdminApi: {} as Record<string, number>,
  // Règle 9 — client Supabase navigateur importé par une page joueuse.
  pagesImportSupabase: [] as string[],
};

/** Briques du kit « Le Ruban » : elles vivent dans `features/ruban/` (P7). */
const RUBAN_BRICK =
  /^(?:Player|Admin|Base|Ui|Ruban)?(?:Button|ButtonLink|IconButton|Chip|Pill|Badge|Card|StatTile|EntityHeader|PageHeader|SectionHeader|Fiche|ListToolbar|DangerZone|FormField|FormFieldset|FormError)$/;

/** Noms de briques Ruban DÉFINIES par une source (déclaration ou fichier). */
function rubanBricksDefined(rel: string, src: string): string[] {
  const out: string[] = [];
  const decl =
    /^\s*(?:export\s+)?(?:default\s+)?(?:function|const|let|class)\s+([A-Z]\w*)/gm;
  for (const m of src.matchAll(decl))
    if (RUBAN_BRICK.test(m[1])) out.push(m[1]);
  const base = path.posix.basename(rel).replace(/\.(ts|tsx)$/, '');
  if (RUBAN_BRICK.test(base)) out.push(`fichier ${base}`);
  // Les classes du kit (`ruban.ts` côté admin) ne se recopient pas non plus.
  if (base === 'ruban') out.push('fichier ruban');
  return out;
}

describe('frontières des modules features/player', () => {
  it('l’arborescence existe (sinon ce test ne vérifierait rien)', () => {
    expect(fs.existsSync(path.join(ROOT, FEATURES, '_shared'))).toBe(true);
    expect(uiFiles.length).toBeGreaterThan(100);
  });

  it('1. ui/ ne touche ni la base, ni le réseau, ni le métier', () => {
    const v = features.flatMap(({ rel, src }) => {
      if (!isUi(rel)) return [];
      const out: string[] = [];
      for (const spec of importsOf(src)) {
        if (/utils\/supabase/.test(spec)) out.push(`${rel} — importe ${spec}`);
        if (/(^|\/)(service|repository)(\/|$)/.test(spec))
          out.push(`${rel} — importe ${spec}`);
      }
      if (/\bfetch\(/.test(src)) out.push(`${rel} — appelle fetch()`);
      return out;
    });
    expect(v).toEqual([]);
  });

  it('2. service et repository ignorent HTTP (next, req/res)', () => {
    const v = features.flatMap(({ rel, src }) => {
      if (!isService(rel) && !isRepository(rel)) return [];
      const out = importsOf(src)
        .filter((spec) => spec === 'next' || spec.startsWith('next/'))
        .map((spec) => `${rel} — importe ${spec}`);
      if (/\bNextApi(Request|Response)\b/.test(src))
        out.push(`${rel} — mentionne NextApiRequest/Response`);
      return out;
    });
    expect(v).toEqual([]);
  });

  it('3. la base est REÇUE (ctx.db), jamais importée, hors ui/', () => {
    const v = features.flatMap(({ rel, src }) =>
      isUi(rel)
        ? []
        : importsOf(src)
            .filter((spec) => /utils\/supabase(Admin)?$/.test(spec))
            .map((spec) => `${rel} — importe ${spec} — passer par ctx.db`)
    );
    expect(v).toEqual([]);
  });

  it('4. un module n’entre pas dans l’ui/ ni le repository d’un autre', () => {
    const v = features.flatMap(({ rel, src }) => {
      const own = moduleOf(rel);
      return importsOf(src)
        .map((spec) => ({ spec, t: featureTarget(rel, spec) }))
        .filter(
          ({ t }) =>
            t &&
            t.module !== own &&
            t.module !== '_shared' &&
            /^(ui|repository)(\/|$)/.test(t.rest)
        )
        .map(({ spec }) => `${rel} — importe ${spec} (module ${own})`);
    });
    expect(v).toEqual([]);
  });

  it('5. seul le service d’un module lit son repository', () => {
    const v = features.flatMap(({ rel, src }) =>
      isService(rel) || isRepository(rel)
        ? []
        : importsOf(src)
            .filter((spec) => /(^|\/)repository(\/|$)/.test(spec))
            .map((spec) => `${rel} — importe ${spec} — passer par le service`)
    );
    expect(v).toEqual([]);
  });

  it('6. les routes API migrées ne font que réexporter leur module', () => {
    const fat = API.flatMap((r) => walk(r))
      .filter((rel) => read(rel).includes('@/features/player/'))
      .filter(
        (rel) =>
          read(rel)
            .split('\n')
            .filter((l) => l.trim() && !l.trim().startsWith('//')).length > 5
      );
    expect(fat).toEqual([]);
  });

  it('7. aucune UI joueuse n’importe pages/api (gel, ne peut que baisser)', () => {
    const now = uiFiles
      .filter(({ rel, src }) =>
        importsOf(src).some((spec) =>
          (resolveSpec(rel, spec) ?? '').startsWith('pages/api/')
        )
      )
      .map(({ rel }) => rel)
      .sort();
    expect(
      now,
      'Nouvel import depuis pages/api : le type de réponse va dans features/player/<domaine>/schemas.ts. Fichier corrigé : retire-le de FROZEN.importsPagesApi.'
    ).toEqual([...FROZEN.importsPagesApi].sort());
  });

  it('8. aucune UI joueuse n’appelle /api/admin/* (gel, ne peut que baisser)', () => {
    const now: Record<string, number> = {};
    for (const { rel, src } of uiFiles) {
      const n = (stripComments(src).match(/['"`]\/api\/admin\//g) || []).length;
      if (n) now[rel] = n;
    }
    expect(
      now,
      'Appel /api/admin depuis l’espace joueuse : passer par une route joueuse. Appel retiré : baisse FROZEN.callsAdminApi.'
    ).toEqual(FROZEN.callsAdminApi);
  });

  it('9. pages/player/** n’importe pas @/utils/supabase (gel)', () => {
    const now = walk('pages/player')
      .filter((rel) =>
        importsOf(read(rel)).some((spec) => /^@\/utils\/supabase/.test(spec))
      )
      .sort();
    expect(now).toEqual([...FROZEN.pagesImportSupabase].sort());
  });

  it('10. features/player/**/routes n’utilise ni withAuthRoute ni withSubjectRoute', () => {
    const v = features
      .filter(({ rel }) => isRoutes(rel))
      .filter(({ src }) => /\bwith(Auth|Subject)Route\b/.test(src))
      .map(({ rel }) => rel);
    expect(v, 'Une route de module passe par defineSubjectRoute.').toEqual([]);
  });

  it('le bundle joueuse n’importe pas features/admin', () => {
    const v = uiFiles.flatMap(({ rel, src }) =>
      importsOf(src)
        .filter((spec) =>
          (resolveSpec(rel, spec) ?? '').startsWith('features/admin/')
        )
        .map((spec) => `${rel} — importe ${spec}`)
    );
    expect(
      v,
      'Le kit commun vit dans features/ruban/, pas dans features/admin (features/admin/_shared/ui n’est qu’un ré-export).'
    ).toEqual([]);
  });
});

/** Le kit unique (P7) et sa couche de compatibilité admin. */
const RUBAN_KIT = 'features/ruban';
const RUBAN_COMPAT = 'features/admin/_shared/ui';

/**
 * Briques déjà définies HORS du kit dans l'admin avant P7 — gel : la liste ne
 * peut que DÉCROÎTRE (une brique migrée vers features/ruban sort d'ici).
 * Le site public (components/ui, components/Buttons…) est hors périmètre.
 */
const FROZEN_ADMIN_BRICKS = [
  'components/admin/caster/ChatPanel.tsx — Badge',
  // Champ local antérieur au kit de formulaires (P6) : à passer sur
  // features/ruban/FormField.
  'components/admin/communications/CampaignsPanel.tsx — FormField',
  'components/admin/onboarding/TenantReadinessPanel.tsx — Pill',
  'components/admin/tenants/TenantOverviewPanel.tsx — Card',
  'features/admin/pilotage/ui/PilotageView.tsx — Card',
];

/** Un fichier de compatibilité ne fait QUE ré-exporter (aucune déclaration). */
const isPureReexport = (src: string) =>
  /^(?:\s*export\s+(?:\*|\{[^}]*\})\s+from\s+'[^']+';)+\s*$/.test(
    stripComments(src)
  );

/** Ré-export pur depuis le kit, et de lui seul. */
const isKitReexport = (src: string) =>
  isPureReexport(src) &&
  importsOf(src).every((spec) => spec.startsWith(`@/${RUBAN_KIT}/`));

describe('garde « iso » : un seul kit Le Ruban', () => {
  // Les deux surfaces qui portent Le Ruban : l'espace joueuse ET l'admin.
  const scanned = [
    ...walk('features').filter((rel) => !rel.startsWith(`${RUBAN_KIT}/`)),
    ...walk('components/player'),
    ...walk('components/admin'),
    ...walk('pages/player'),
    ...walk('pages/admin'),
  ];

  it('le détecteur mord (sinon la garde passerait à vide)', () => {
    expect(
      rubanBricksDefined(
        'features/player/x/ui/Panel.tsx',
        'export function Button() {}\nconst Chip = () => null;\nexport default function PlayerCard() {}'
      )
    ).toEqual(['Button', 'Chip', 'PlayerCard']);
    expect(
      rubanBricksDefined('components/player/StatTile.tsx', 'export default X;')
    ).toEqual(['fichier StatTile']);
    // Un composant de domaine n'est pas une brique du kit.
    expect(
      rubanBricksDefined(
        'components/player/TeamCard.tsx',
        'export default function TeamCard() {}\nfunction RoleBadge() {}'
      )
    ).toEqual([]);
    // La compatibilité ne tolère qu'un ré-export pur.
    expect(
      isPureReexport("// c\nexport { default } from '@/features/ruban/Chip';")
    ).toBe(true);
    expect(
      isPureReexport(
        "export { default } from '@/features/ruban/Chip';\nexport function Chip() {}"
      )
    ).toBe(false);
  });

  it('le kit features/ruban expose chaque brique', async () => {
    const kit = await import('../../features/ruban');
    for (const name of [
      'Button',
      'ButtonLink',
      'Card',
      'Chip',
      'StatTile',
      'EntityHeader',
      'FicheLayout',
      'FicheSection',
      'MetaList',
      'ListToolbar',
      'ListSearch',
      'FilterSelect',
      'DangerZone',
      'PageHeader',
    ])
      expect(typeof (kit as Record<string, unknown>)[name], name).toBe(
        'function'
      );
  });

  it('features/admin/_shared/ui ne fait que ré-exporter le kit', () => {
    const v = walk(RUBAN_COMPAT).filter((rel) => {
      const src = read(rel);
      return (
        !isPureReexport(src) ||
        importsOf(src).some((spec) => !spec.startsWith(`@/${RUBAN_KIT}/`))
      );
    });
    expect(
      v,
      'Une brique se définit dans features/ruban/ ; features/admin/_shared/ui n’est qu’une couche de compatibilité.'
    ).toEqual([]);
  });

  it('aucune brique Ruban définie hors features/ruban (admin et joueuse)', () => {
    const v = scanned
      .filter((rel) => !rel.startsWith(`${RUBAN_COMPAT}/`))
      // Ancien chemin conservé en ré-export PUR du kit (ex. le FormField
      // admin, déplacé au lot P6) : il ne définit rien.
      .filter((rel) => !isKitReexport(read(rel)))
      .flatMap((rel) =>
        rubanBricksDefined(rel, read(rel)).map((b) => `${rel} — ${b}`)
      )
      .sort();
    expect(
      v,
      'Une brique (bouton, puce, carte, en-tête…) naît dans features/ruban/, jamais dans une surface. Brique migrée : retire-la de FROZEN_ADMIN_BRICKS.'
    ).toEqual([...FROZEN_ADMIN_BRICKS].sort());
  });

  it('aucune brique Ruban dans l’espace joueuse (zéro, pas de gel)', () => {
    const v = scanned
      .filter((rel) =>
        /^(features\/player|components\/player|pages\/player)\//.test(rel)
      )
      .flatMap((rel) => rubanBricksDefined(rel, read(rel)));
    expect(v).toEqual([]);
  });
});
