// Unit tests — la décision du cliquet de bundles (scripts/bundle-budget.mjs).
//
// Le script lui-même ne tourne qu'après un `next build` (étape CI dédiée).
// Ce qui se teste sans build, c'est la décision : mesurer une page, comparer
// au gel, reconnaître un module serveur. Si l'une de ces trois fonctions
// dérive, le garde-fou devient décoratif sans que rien ne rougisse.

import { describe, it, expect } from 'vitest';
import {
  measurePages,
  compareBudget,
  findServerChunks,
  TOLERANCE_KB,
} from '../../scripts/bundle-budget.mjs';

describe('measurePages', () => {
  const sizes: Record<string, number> = {
    'a.js': 100 * 1024,
    'b.js': 20 * 1024,
    'c.js': 5 * 1024,
    'x.css': 999 * 1024,
  };
  const readSize = (f: string) => sizes[f];

  it('compte _app + page, sans compter deux fois un chunk partagé', () => {
    const out = measurePages(
      { '/_app': ['a.js'], '/p': ['a.js', 'b.js', 'c.js'] },
      readSize
    );
    expect(out['/p']).toBe(125);
    expect(out['/_app']).toBe(100);
  });

  it('ignore le CSS et les entrées internes /_*', () => {
    const out = measurePages(
      { '/_app': ['a.js', 'x.css'], '/_error': ['b.js'], '/q': ['c.js'] },
      readSize
    );
    expect(out['/q']).toBe(105);
    expect(out).not.toHaveProperty('/_error');
  });
});

describe('compareBudget', () => {
  it('échoue au-delà du gel + tolérance, pas en deçà', () => {
    const limit = 200;
    const atEdge = compareBudget(
      { '/p': limit + TOLERANCE_KB },
      { '/p': limit }
    );
    expect(atEdge.ok).toBe(true);
    const over = compareBudget(
      { '/p': limit + TOLERANCE_KB + 1 },
      { '/p': limit }
    );
    expect(over.ok).toBe(false);
    expect(over.over).toEqual([
      { page: '/p', kb: limit + TOLERANCE_KB + 1, limit },
    ]);
  });

  it('ne bloque pas une page nouvelle, mais la signale', () => {
    const r = compareBudget({ '/new': 400 }, {});
    expect(r.ok).toBe(true);
    expect(r.unfrozen).toEqual([{ page: '/new', kb: 400 }]);
  });

  it('signale les gels orphelins et les gains à verrouiller', () => {
    const r = compareBudget({ '/p': 150 }, { '/p': 200, '/gone': 180 });
    expect(r.gone).toEqual(['/gone']);
    expect(r.under).toEqual([{ page: '/p', kb: 150, limit: 200 }]);
  });
});

describe('findServerChunks', () => {
  it('reconnaît le code qui lit la clé service role', () => {
    const chunks = [
      { file: 'ok.js', content: 'createBrowserClient(url, anon)' },
      {
        file: 'bad.js',
        content:
          'n=a.env.NEXT_SUPABASE_SERVICE_ROLE_KEY||a.env.SUPABASE_SERVICE_ROLE_KEY',
      },
    ];
    expect(findServerChunks(chunks)).toEqual(['bad.js']);
  });
});
