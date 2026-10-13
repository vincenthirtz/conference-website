// Garde du lot 4b : le site n'importe jamais `pages/api`, même pour un type.
//
// Pourquoi : `pages/api` est en route vers conference-api (étape 4 de son
// README). Un `import type { XResponse } from '@/pages/api/…'` dans une page,
// un composant ou un util est un fil de plus à couper le jour où le dossier
// part — et il repousse le type de réponse dans la route, là où personne ne le
// partage. Le type vit à côté de ce qui le produit (features/<espace>/…,
// utils/…) ; la route l'importe et le réexporte pour ses tests.
//
// À ZÉRO depuis le 2026-10-13 (32 fichiers corrigés). Pas de gel : un nouveau
// contrevenant échoue, avec son fichier et sa ligne. `tests/` reste libre
// d'importer les routes — c'est son travail.

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

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) {
      return name === 'node_modules' ? [] : walk(rel);
    }
    return /\.(ts|tsx|mts|mjs|js)$/.test(name) ? [rel] : [];
  });
}

/** Sources d'import (statiques, `export … from`, dynamiques), avec leur ligne. */
function importsOf(src: string): { spec: string; line: number }[] {
  const out: { spec: string; line: number }[] = [];
  const re =
    /(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1] ?? m[2];
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ spec, line });
  }
  return out;
}

/** Résout vers un chemin relatif au dépôt si l'import vise un fichier du dépôt. */
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

describe('le site n’importe pas pages/api (lot 4b)', () => {
  const files = ZONES.flatMap(walk)
    .map((rel) => rel.split(path.sep).join('/'))
    .filter((rel) => !rel.startsWith('pages/api/'));

  it('le périmètre existe (sinon ce test ne vérifierait rien)', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('aucun import de pages/api hors de pages/api et des tests', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const { spec, line } of importsOf(src)) {
        const target = resolveSpec(rel, spec);
        if (target?.startsWith('pages/api/')) {
          offenders.push(`${rel}:${line} → ${spec}`);
        }
      }
    }
    expect(
      offenders,
      'Le type de réponse va à côté de ce qui le produit (features/<espace>/…, utils/…) ; la route l’importe et le réexporte.'
    ).toEqual([]);
  });
});
