// Garde de propriété après la bascule 4e (2026-10-13) : conference-api porte
// toute l'API. Ce dépôt n'a plus de routes (sauf `pages/api/internal/*`, la
// régénération ISR qui DOIT tourner sur Netlify), et il n'importe jamais le
// métier serveur d'un module — `routes/`, `service/`, `repository/` de
// `features/*` vivent dans conference-api. Les fichiers partagés qu'il importe
// encore lui arrivent par `npm run sync:api` et sont listés dans
// `.api-sync-manifest.json` : on ne les édite pas ici.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const ZONES = [
  'pages',
  'components',
  'hooks',
  'features',
  'utils',
  'lib',
  'netlify',
  'config',
  'types',
];
const SERVER_LAYERS =
  /^features\/[^/]+\/[^/]+\/(routes|service|repository)(\/|\.ts$|\.tsx$)/;

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) {
      return name === 'node_modules' ? [] : walk(rel);
    }
    return /\.(ts|tsx|mjs|js)$/.test(name)
      ? [rel.split(path.sep).join('/')]
      : [];
  });
}

function importsOf(src: string): string[] {
  const out: string[] = [];
  const re =
    /(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

function resolveSpec(fromRel: string, spec: string): string | null {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (spec.startsWith('.')) {
    return path
      .normalize(path.join(path.dirname(fromRel), spec))
      .split(path.sep)
      .join('/');
  }
  return null;
}

describe('propriété de l’API (bascule 4e)', () => {
  it('pages/api ne contient plus que internal/', () => {
    const routes = walk('pages/api').filter(
      (r) => !r.startsWith('pages/api/internal/')
    );
    expect(
      routes,
      'Une route API se code dans conference-api (pages/api y est natif).'
    ).toEqual([]);
  });

  it('aucun code du site n’exécute routes/, service/ ou repository/ d’un module', () => {
    // Les copies livrées par la synchro (manifeste) sont du code de l'API :
    // elles s'importent entre elles, ce n'est pas le sujet. Le sujet : un
    // fichier PROPRE au site qui appellerait du métier serveur. Un `import
    // type` est toléré — effacé à la compilation, il ne tire rien au runtime
    // (c'est ce qui reste du lot 4b : des types de réponse déclarés dans un
    // service ; à déplacer vers un model.ts pour alléger le manifeste).
    const manifest = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(ROOT, '.api-sync-manifest.json'), 'utf8')
        ) as { files: string[] }
      ).files
    );
    const offenders: string[] = [];
    for (const rel of ZONES.flatMap(walk)) {
      if (manifest.has(rel)) continue;
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const valueImports = src.replace(
        /^(import|export)\s+type\s[^;]*;$/gm,
        ''
      );
      for (const spec of importsOf(valueImports)) {
        const target = resolveSpec(rel, spec);
        if (!target || !SERVER_LAYERS.test(target)) continue;
        // Cible appartenant à l'API (dans le manifeste) : interdit au runtime.
        // Un service/repository PROPRE au site (ex. l'éditeur de fiche
        // d'équipe, rendu côté serveur par Netlify) n'est pas concerné.
        const owned = ['', '.ts', '.tsx', '/index.ts'].some((e) =>
          manifest.has(target + e)
        );
        if (owned) offenders.push(`${rel} → ${spec}`);
      }
    }
    expect(
      offenders,
      'Le métier serveur vit dans conference-api. Côté site : ui/, client.ts, hooks/, schemas et models (via le manifeste) ; un type de réponse s’importe en `import type`.'
    ).toEqual([]);
  });

  it('le manifeste de synchro existe et ne liste que des fichiers présents', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, '.api-sync-manifest.json'), 'utf8')
    ) as { files: string[] };
    expect(manifest.files.length).toBeGreaterThan(100);
    const missing = manifest.files.filter(
      (f) => !fs.existsSync(path.join(ROOT, f))
    );
    expect(missing, 'Lance `npm run sync:api`.').toEqual([]);
  });
});
