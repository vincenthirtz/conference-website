// Women's Library, lot 8 — « La fréquentation de la Grande salle de lecture
// n'est jamais mesurée par personne » (docs/PLAN-womens-library.md, section 4).
//
// La mesure d'audience (Plausible ou Umami, avec consentement) reçoit le
// chemin de chaque page. `/player/library?room=<uuid>` y aurait compté les
// visites de LA salle de lecture (un identifiant unique par espace) et nommé
// les appartements visités. `pageviewPath` ramène toute la Library à UNE page,
// y compris quand son adresse est citée dans la query d'une autre (retour
// après connexion).
//
// Doubles minimaux de window/document, comme analyticsLot0.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isLibraryPagePath,
  LIBRARY_PAGE_PATH,
  pageviewPath,
} from '@/lib/analytics/pagePath';
import {
  markAnalyticsReady,
  resetAnalyticsQueueForTests,
  trackPageview,
} from '@/lib/analytics/track';

const READING = '6f1c2b9e-3d4a-4f5b-8c7d-112233445566';

describe('pageviewPath', () => {
  it('la Library est une seule page : ni salle, ni ancre, ni sous-page', () => {
    expect(pageviewPath(`/player/library?room=${READING}`)).toBe(
      LIBRARY_PAGE_PATH
    );
    expect(pageviewPath('/player/library')).toBe(LIBRARY_PAGE_PATH);
    expect(pageviewPath(`/player/library?room=${READING}#x`)).toBe(
      LIBRARY_PAGE_PATH
    );
    expect(pageviewPath('/player/library/anything?a=1')).toBe(
      LIBRARY_PAGE_PATH
    );
  });

  it('une adresse de la Library citée dans la query est ramenée à la Library', () => {
    const login = `/login?next=${encodeURIComponent(`/player/library?room=${READING}`)}`;
    const out = pageviewPath(login);
    expect(out).not.toContain(READING);
    expect(new URL(out, 'https://x.test').searchParams.get('next')).toBe(
      LIBRARY_PAGE_PATH
    );
  });

  it('les autres pages passent telles quelles', () => {
    for (const path of [
      '/',
      '/inscription-2026?utm_source=twitch',
      '/player',
      '/player/tcg',
      '/player/librarything',
      '/support?category=behavior&anonymous=1',
      '/login?next=%2Fplayer%2Ftcg',
    ]) {
      expect(pageviewPath(path)).toBe(path);
    }
  });

  it('isLibraryPagePath ne prend pas un simple préfixe', () => {
    expect(isLibraryPagePath('/player/library')).toBe(true);
    expect(isLibraryPagePath('/player/library?room=x')).toBe(true);
    expect(isLibraryPagePath('/player/librarything')).toBe(false);
    expect(isLibraryPagePath('/player')).toBe(false);
  });
});

/* ---------------------------------------------- trackPageview, de bout en bout --- */

const ENV = {
  NEXT_PUBLIC_ANALYTICS_PROVIDER: 'plausible',
  NEXT_PUBLIC_ANALYTICS_HOST: 'https://plausible.io',
  NEXT_PUBLIC_ANALYTICS_SITE_ID: 'owwomenscup.fr',
};
const saved: Record<string, string | undefined> = {};

function installWindow(href: string) {
  const url = new URL(href);
  const store = new Map<string, string>([
    [
      'cookie_consent',
      JSON.stringify({
        version: '1.0',
        preferences: {
          essential: true,
          functional: false,
          analytics: true,
          marketing: false,
        },
        consentDate: '2026-08-23T00:00:00.000Z',
      }),
    ],
  ]);
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  const w = {
    localStorage: storage,
    sessionStorage: storage,
    location: {
      href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      host: url.host,
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    plausible: vi.fn(),
    umami: { track: vi.fn() },
  };
  (globalThis as any).window = w;
  (globalThis as any).document = { referrer: '' };
  return w;
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  resetAnalyticsQueueForTests();
});

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  resetAnalyticsQueueForTests();
});

describe('trackPageview n’envoie jamais l’identifiant d’une salle', () => {
  it('Plausible : première pageview (adresse courante) et navigation SPA', () => {
    const w = installWindow(
      `https://owwomenscup.fr/player/library?room=${READING}`
    );
    markAnalyticsReady();
    trackPageview();
    trackPageview(`/player/library?room=${READING}`);
    expect(w.plausible).toHaveBeenCalledTimes(2);
    for (const call of w.plausible.mock.calls) {
      expect(call[1]).toEqual({ u: 'https://owwomenscup.fr/player/library' });
    }
  });

  it('Umami : l’url envoyée est celle de la Library, sans la salle', () => {
    process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER = 'umami';
    process.env.NEXT_PUBLIC_ANALYTICS_HOST = 'https://stats.owwomenscup.fr';
    process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID = 'a1b2c3';
    const w = installWindow('https://owwomenscup.fr/');
    markAnalyticsReady();
    trackPageview(`/player/library?room=${READING}`);
    const build = w.umami.track.mock.calls[0][0] as (
      p: Record<string, unknown>
    ) => Record<string, unknown>;
    expect(build({ url: 'ignored' }).url).toBe('/player/library');
    expect(JSON.stringify(w.umami.track.mock.calls)).not.toContain(READING);
  });
});
