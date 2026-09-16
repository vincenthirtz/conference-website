// La clé de cache CDN des API varie sur la query et sur les en-têtes d'identité.
//
// LE BUG QUE CE TEST EMPÊCHE DE REVENIR. Sur Netlify, la clé de cache d'une
// route Next ne variait que sur `__nextDataReq` et `_rsc`. Constaté en
// production le 16/09/2026 : `/api/public/v1/tournaments?tenant=pogtv`
// renvoyait les tournois Women's Cup, y compris avec un paramètre anti-cache.
// Filtres, pagination et `?tenant=` étaient neutralisés sur une vingtaine de
// routes. Le piège était déjà connu (`utils/og/matchPoster.tsx`) mais n'avait
// été corrigé que pour une route : d'où une règle centrale, et ce garde.
//
// Ce que ce test NE prouve PAS : que Netlify honore l'en-tête. Ça, seul un appel
// en production le montre (deux variantes de query → deux réponses, et un
// paramètre anti-cache → `fwd=miss`). Il prouve que la règle existe, qu'elle
// couvre bien chaque route, et que les deux règles ne se recouvrent pas.

import { describe, it, expect } from 'vitest';
// Le moteur de chemins EMBARQUÉ par Next, celui qui évalue `source` — pas une
// réimplémentation qui pourrait diverger sur la syntaxe des groupes.
// Chargé par `require` : ce module compilé n'expose pas de déclaration de types.
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (source: string) => RegExp;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require('../../next.config.js');

type HeaderRule = {
  source: string;
  headers: { key: string; value: string }[];
};

async function varyRules(): Promise<HeaderRule[]> {
  const rules: HeaderRule[] = await nextConfig.headers();
  return rules.filter((r) =>
    r.headers.some((h) => h.key.toLowerCase() === 'netlify-vary')
  );
}

function matches(source: string, path: string): boolean {
  return pathToRegexp(source).test(path);
}

function varyFor(rules: HeaderRule[], path: string): string[] {
  return rules
    .filter((r) => matches(r.source, path))
    .flatMap((r) =>
      r.headers
        .filter((h) => h.key.toLowerCase() === 'netlify-vary')
        .map((h) => h.value)
    );
}

/** Directives d'un en-tête Netlify-Vary : `query`, `header=a|b`… */
function directives(value: string) {
  const out = { allQuery: false, headers: new Set<string>() };
  for (const part of value.split(',')) {
    const [key, v] = part.trim().split('=');
    if (key === 'query' && !v) out.allQuery = true;
    if (key === 'header' && v) {
      for (const h of v.split('|')) out.headers.add(h.toLowerCase());
    }
  }
  return out;
}

const PUBLIC_ROUTES = [
  '/api/public/v1/tournaments',
  '/api/public/v1/tournaments/ow-womens-cup-2026/matches',
  '/api/public/openapi',
  '/api/news/comments',
  '/api/teams',
  '/api/overlay/match/56e20536-9f49-4875-b1e1-eeef25a26331',
];

const BOT_ROUTES = [
  '/api/bot/v1/twitch/live',
  '/api/bot/v1/leaderboards/teams',
];

describe('Netlify-Vary sur les routes API', () => {
  it.each(PUBLIC_ROUTES)(
    '%s varie sur TOUTE la query (et sur authorization)',
    async (path) => {
      const values = varyFor(await varyRules(), path);
      // Exactement une règle : deux règles concurrentes feraient dépendre la
      // valeur finale de l'ordre d'application de Next.
      expect(values).toHaveLength(1);
      const d = directives(values[0]);
      expect(d.allQuery).toBe(true);
      expect(d.headers.has('authorization')).toBe(true);
    }
  );

  it.each(BOT_ROUTES)(
    '%s varie sur la query ET sur les en-têtes qui fixent l’espace',
    async (path) => {
      const values = varyFor(await varyRules(), path);
      expect(values).toHaveLength(1);
      const d = directives(values[0]);
      expect(d.allQuery).toBe(true);
      for (const h of ['x-api-key', 'x-tenant-id', 'x-guild-id']) {
        expect(d.headers.has(h)).toBe(true);
      }
    }
  );

  it('une route dont le nom COMMENCE par « bot » sans en être une reste couverte', async () => {
    // La règle générale exclut `bot/` avec la barre oblique : un futur
    // `/api/botanique` ne doit pas tomber entre les deux règles.
    const values = varyFor(await varyRules(), '/api/botanique');
    expect(values).toHaveLength(1);
    expect(directives(values[0]).allQuery).toBe(true);
  });

  it('les pages hors API ne sont pas touchées', async () => {
    // Les pages ISR ne lisent pas la query côté serveur ; varier dessus ne
    // ferait que fragmenter leur cache.
    for (const path of ['/', '/player', '/recrutement']) {
      expect(varyFor(await varyRules(), path)).toHaveLength(0);
    }
  });
});
