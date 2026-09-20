// Unit tests — chaque route TCG de l'espace joueuse plafonne ses appels.
//
// POURQUOI CETTE GARDE EXISTE. `pages/api/player/tcg/photo.ts` a vécu des mois
// avec un plafond sur son POST (5/min) et sur son DELETE (10/min), et RIEN sur
// son GET. Personne ne l'avait décidé : c'est le genre d'oubli qu'on ne voit
// pas en relisant un fichier de quatre cents lignes, parce que les deux autres
// méthodes, elles, sont bien gardées — l'œil lit « il y a des plafonds ici » et
// passe. Il a fallu un audit pour le repérer.
//
// CE QUE CE TEST VÉRIFIE, ET CE QU'IL NE VÉRIFIE PAS. Il lit le SOURCE des
// routes et vérifie qu'il cite `applyRateLimit` au moins autant de fois qu'il
// sert de méthodes. C'est grossier, et volontairement : un test qui appellerait
// chaque handler soixante fois pour voir le 429 arriver coûterait cher et
// dirait la même chose. Ce qu'on cherche à empêcher n'est pas un plafond mal
// réglé — c'est un plafond ABSENT.
//
// La conséquence assumée : ce test ne dit rien de la VALEUR des plafonds. Un
// `max: 100000` le laisserait vert. C'est le bon compromis tant que le mode
// d'échec observé est l'oubli, pas le laxisme.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['pages/api/player/tcg', 'pages/api/player/tcg/trades'] as const;

/** Les fichiers de route, sans descendre dans les sous-dossiers déjà listés. */
function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(dir, e.name));
}

/**
 * Les méthodes HTTP qu'un fichier sert vraiment.
 *
 * On compte les `req.method === '<VERBE>'` et les `case '<VERBE>'`. Un fichier
 * qui n'en cite aucun ne sert qu'une méthode (le handler traite tout ce qui
 * passe le garde `withAuthRoute`), d'où le plancher à 1.
 */
function methodsServed(source: string): number {
  const found = new Set<string>();
  for (const m of source.matchAll(
    /req\.method\s*===\s*'(GET|POST|PUT|PATCH|DELETE)'/g
  )) {
    found.add(m[1]);
  }
  for (const m of source.matchAll(/case '(GET|POST|PUT|PATCH|DELETE)'/g)) {
    found.add(m[1]);
  }
  return Math.max(1, found.size);
}

/** Les appels à `applyRateLimit`, sans compter la ligne d'import. */
function rateLimitCalls(source: string): number {
  return (source.match(/applyRateLimit\(/g) ?? []).length;
}

describe('routes TCG joueuse — plafond par méthode', () => {
  const files = ROOTS.flatMap(routeFiles);

  it('trouve bien les routes à contrôler', () => {
    // Si ce dossier est déplacé, le test ne doit pas devenir vert en ne
    // regardant plus rien.
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    const rel = relative(process.cwd(), file);
    it(`${rel} plafonne chacune de ses méthodes`, () => {
      const source = readFileSync(file, 'utf8');
      const served = methodsServed(source);
      const guarded = rateLimitCalls(source);
      expect(guarded).toBeGreaterThanOrEqual(served);
    });
  }
});
