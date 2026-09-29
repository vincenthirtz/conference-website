// Règles de frontière des modules admin — lot L2
// (docs/PLAN-industrialisation-admin.md, docs/adr/0001-admin-feature-modules.md).
//
// Un module `features/admin/<domaine>/` sépare ce qui répond (routes), ce qui
// décide (service), ce qui lit/écrit (repository) et ce qui affiche (ui). Ces
// règles ne valent que si quelque chose les vérifie : ce test lit la SOURCE,
// comme `siteSettingsGuard`. Une violation échoue avec le fichier et la règle.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PLAYER_SPACE_ROUTES } from '../../utils/layout/appChrome';

const ROOT = path.resolve(__dirname, '../..');
const FEATURES = 'features/admin';

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

function importsOf(src: string): string[] {
  const out: string[] = [];
  const re =
    /(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

/** Module propriétaire d'un fichier : `features/admin/<module>/…`. */
function moduleOf(rel: string): string | null {
  const parts = rel.split(path.sep);
  return parts[0] === 'features' && parts[1] === 'admin' ? parts[2] : null;
}

/** Résout un import vers `features/admin/<module>/<reste>` si c'en est un. */
function featureTarget(
  fromRel: string,
  spec: string
): { module: string; rest: string } | null {
  let target: string | null = null;
  if (spec.startsWith('@/features/admin/')) {
    target = spec.slice('@/'.length);
  } else if (spec.startsWith('.')) {
    target = path.normalize(path.join(path.dirname(fromRel), spec));
  }
  if (!target) return null;
  const parts = target.split(path.sep).join('/').split('/');
  if (parts[0] !== 'features' || parts[1] !== 'admin' || !parts[2]) return null;
  return { module: parts[2], rest: parts.slice(3).join('/') };
}

const files = walk(FEATURES).map((rel) => ({
  rel,
  src: fs.readFileSync(path.join(ROOT, rel), 'utf8'),
}));

const isUi = (rel: string) => rel.split(path.sep).includes('ui');
const isService = (rel: string) => /[/\\]service(\.ts|[/\\])/.test(rel);
const isRepository = (rel: string) => /[/\\]repository(\.ts|[/\\])/.test(rel);
const isServerLayer = (rel: string) => isService(rel) || isRepository(rel);

/** Exceptions nommées, gelées. Vide aujourd'hui — qu'elle le reste. */
const ALLOWED: Record<string, string> = {};

function violations(check: (f: { rel: string; src: string }) => string[]) {
  return files.flatMap((f) =>
    check(f)
      .map((v) => `${f.rel} — ${v}`)
      .filter((v) => !ALLOWED[v])
  );
}

describe('frontières des modules features/admin', () => {
  it('le pilote existe (sinon ce test ne vérifierait rien)', () => {
    expect(files.some((f) => f.rel.includes('free-players'))).toBe(true);
  });

  it('1. ui/ ne touche ni la base, ni le réseau, ni le métier', () => {
    const v = violations(({ rel, src }) => {
      if (!isUi(rel)) return [];
      const out: string[] = [];
      for (const spec of importsOf(src)) {
        if (/utils\/supabase/.test(spec)) out.push(`importe ${spec}`);
        if (/(^|\/)(service|repository)(\/|$)/.test(spec))
          out.push(`importe ${spec}`);
      }
      if (/\bfetch\(/.test(src)) out.push('appelle fetch()');
      return out;
    });
    expect(v).toEqual([]);
  });

  it('2. service et repository ignorent HTTP (next, req/res)', () => {
    const v = violations(({ rel, src }) => {
      if (!isServerLayer(rel)) return [];
      const out: string[] = [];
      for (const spec of importsOf(src)) {
        if (spec === 'next' || spec.startsWith('next/'))
          out.push(`importe ${spec}`);
      }
      if (/\bNextApi(Request|Response)\b/.test(src))
        out.push('mentionne NextApiRequest/Response');
      return out;
    });
    expect(v).toEqual([]);
  });

  it('3. la base est REÇUE (ctx.db), jamais importée, dans service/repository/routes', () => {
    const v = violations(({ rel, src }) => {
      if (isUi(rel)) return [];
      return importsOf(src)
        .filter((spec) => /utils\/supabase(Admin)?$/.test(spec))
        .map((spec) => `importe ${spec} — passer par ctx.db`);
    });
    expect(v).toEqual([]);
  });

  // `_shared` est le kit commun de l'admin (coquille, cache ; les briques
  // d'archétype vivent dans `features/ruban`, ré-exportées par `_shared/ui`) :
  // il est FAIT pour être importé par tous les modules.
  it('4. un module n’entre pas dans l’ui/ ni le repository d’un autre', () => {
    const v = violations(({ rel, src }) => {
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
        .map(({ spec }) => `importe ${spec} (module ${own})`);
    });
    expect(v).toEqual([]);
  });

  it('5. seul le service d’un module lit son repository', () => {
    const v = violations(({ rel, src }) => {
      if (isService(rel) || isRepository(rel)) return [];
      return importsOf(src)
        .filter((spec) => /(^|\/)repository(\/|$)/.test(spec))
        .map((spec) => `importe ${spec} — passer par le service`);
    });
    expect(v).toEqual([]);
  });

  it('TanStack Query ne sort pas de l’admin et de l’espace joueuse (bundle public intact)', () => {
    // La librairie est autorisée pour l'admin (lot L10) et pour la couche
    // client des modules joueuse (lot P5, `features/player/**`). Un import
    // depuis une page publique, un composant partagé ou `_app` la ferait
    // entrer dans le premier chargement de tout le site — sans erreur, sans
    // alerte. Les composants joueuse n'y accèdent qu'À TRAVERS un hook de
    // `features/player` ; le test transitif ci-dessous garde le public.
    const allowed =
      /^(pages[/\\]admin|features[/\\]admin|features[/\\]player|components[/\\]admin|tests)[/\\]/;
    const offenders = [
      'pages',
      'components',
      'hooks',
      'utils',
      'lib',
      'features',
    ]
      .flatMap((d) => walk(d))
      .filter((rel) => !allowed.test(rel))
      .filter((rel) =>
        fs
          .readFileSync(path.join(ROOT, rel), 'utf8')
          .includes('@tanstack/react-query')
      );
    expect(offenders).toEqual([]);
  });

  // Garde TRANSITIVE du site public (lot P5). La règle précédente ne lit que
  // la source : depuis que `components/player/*` consomme des hooks de
  // `features/player` (donc TanStack), une page publique qui importerait une
  // carte joueuse embarquerait la librairie sans jamais écrire son nom. On
  // suit donc les imports (hors `import type`, effacés à la compilation)
  // depuis chaque page publique et `_app` / `_document`.
  it('aucune page publique n’atteint TanStack ni features/player', () => {
    const exts = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
    const resolveLocal = (from: string, spec: string): string | null => {
      let base: string;
      if (spec.startsWith('@/')) base = spec.slice(2);
      else if (spec.startsWith('.'))
        base = path.posix.join(path.posix.dirname(from), spec);
      else return null;
      for (const ext of exts) {
        const cand = path.posix.normalize(base + ext);
        const abs = path.join(ROOT, cand);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return cand;
      }
      return null;
    };
    const valueImports = (src: string): string[] => {
      const out: string[] = [];
      const re =
        /(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
      for (const m of src.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]);
      return out;
    };
    const posix = (rel: string) => rel.split(path.sep).join('/');
    // Pages de l'espace joueuse HORS /player (`PLAYER_SPACE_ROUTES`,
    // utils/layout/appChrome.ts : `/team/[slug]/edit`, check-in à jeton…) :
    // réservées, pas publiques — la surface les traite déjà comme joueuses.
    const routeOf = (rel: string) =>
      rel.replace(/^pages/, '').replace(/(\/index)?\.tsx?$/, '') || '/';
    const publicEntries = walk('pages')
      .map(posix)
      .filter(
        (rel) =>
          !/^pages\/(admin|api|dev)\//.test(rel) &&
          (!rel.startsWith('pages/player/') ||
            rel === 'pages/player/[userId].tsx') &&
          !PLAYER_SPACE_ROUTES.has(routeOf(rel))
      );
    expect(publicEntries.length).toBeGreaterThan(10);

    // `features/admin` / `components/admin` ne sont PAS cherchés ici : des
    // pages publiques en tirent déjà des briques (bracket, timer de draft) ou
    // des schémas côté serveur (`getServerSideProps` du portail développeur),
    // ce qu'une lecture statique ne sait pas départager.
    // Les `schemas.ts` joueuse (zod pur, contrat client + serveur) et leur
    // brique commune `_shared/zod.ts` restent atteignables : le registre
    // OpenAPI les lit pour le portail développeur.
    const forbidden = (rel: string, src: string) =>
      (rel.startsWith('features/player/') &&
        !rel.endsWith('/schemas.ts') &&
        rel !== 'features/player/_shared/zod.ts') ||
      src.includes('@tanstack/react-query');

    const reach = (entry: string): string[] => {
      const found: string[] = [];
      const seen = new Set<string>();
      const stack: Array<{ rel: string; via: string[] }> = [
        { rel: entry, via: [] },
      ];
      while (stack.length) {
        const { rel, via } = stack.pop() as { rel: string; via: string[] };
        if (seen.has(rel)) continue;
        seen.add(rel);
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (forbidden(rel, src)) {
          found.push([...via, rel].join(' → '));
          continue;
        }
        for (const spec of valueImports(src)) {
          const next = resolveLocal(rel, spec);
          if (next) stack.push({ rel: next, via: [...via, rel] });
        }
      }
      return found;
    };

    // Le détecteur mord : la page joueuse, elle, atteint le cache.
    expect(reach('pages/player/index.tsx').length).toBeGreaterThan(0);
    const offenders = publicEntries.flatMap(reach);
    expect(offenders).toEqual([]);
  });

  // `features/ruban` (lot P7) : LE kit Le Ruban, commun à l'admin et à
  // l'espace joueuse. Importable par les deux, il ne tire donc rien de
  // l'admin (ni TanStack, ni `features/admin`, ni `components/admin`) ni de la
  // base : sinon le bundle joueuse embarquerait l'admin.
  it('le kit commun features/ruban ne tire ni l’admin, ni TanStack, ni la base', () => {
    const kit = walk('features/ruban');
    expect(kit.length).toBeGreaterThan(0);
    const v = kit.flatMap((rel) =>
      importsOf(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
        .filter((spec) => {
          const t = spec.startsWith('.')
            ? path.posix.join(
                path.posix.dirname(rel.split(path.sep).join('/')),
                spec
              )
            : spec.replace(/^@\//, '');
          return (
            /^@tanstack\//.test(spec) ||
            /^(features|components|pages)\/admin(\/|$)/.test(t) ||
            /(^|\/)utils\/supabase/.test(t)
          );
        })
        .map((spec) => `${rel} — importe ${spec}`)
    );
    expect(v).toEqual([]);
  });

  it('les pages/api migrées ne font que réexporter leur module', () => {
    const api = walk('pages/api/admin')
      .map((rel) => ({
        rel,
        src: fs.readFileSync(path.join(ROOT, rel), 'utf8'),
      }))
      .filter(({ src }) => src.includes('@/features/admin/'));
    const fat = api
      .filter(({ src }) => {
        const code = src
          .split('\n')
          .filter((l) => l.trim() && !l.trim().startsWith('//'));
        return code.length > 5;
      })
      .map(({ rel }) => rel);
    expect(fat).toEqual([]);
  });
});
