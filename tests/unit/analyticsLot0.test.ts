// Lot 0 — instrumentation de l'entonnoir d'acquisition
// (docs/BACKLOG-acquisition-joueuses.md).
//
// Ce que ces tests protègent, par ordre d'importance :
//   1. AUCUNE mesure sans consentement explicite — c'est la garantie RGPD, et
//      c'est une régression silencieuse par nature (rien ne casse à l'écran).
//   2. La CSP ne peut pas être détournée par la variable d'environnement de
//      l'hôte analytics (elle est concaténée dans un en-tête HTTP).
//   3. L'attribution est de PREMIÈRE touche et ne fuit pas d'URL complète.
//
// Pas de jsdom (politique zéro dépendance) : on installe des doubles minimaux
// de window/document, ce qui suffit puisque les modules n'accèdent aux globals
// que dans le corps des fonctions, jamais à l'import.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  buildAnalyticsConfig,
  sanitizeAnalyticsOrigin,
  readAnalyticsConfig,
} from '@/lib/analytics/config';
import { hasAnalyticsConsent } from '@/lib/analytics/consent';
import {
  parseAttribution,
  captureAttribution,
  readStoredAttribution,
  resolveSignupSource,
  ATTRIBUTION_STORAGE_KEY,
} from '@/lib/analytics/attribution';
import {
  ANALYTICS_EVENTS,
  trackEvent,
  trackPageview,
  markAnalyticsReady,
  resetAnalyticsQueueForTests,
} from '@/lib/analytics/track';

// --- doubles minimaux de l'environnement navigateur ------------------------

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

type FakeWindowOpts = {
  href?: string;
  referrer?: string;
  /** `undefined` = aucun consentement enregistré (le cas par défaut). */
  analyticsConsent?: boolean;
  /** Simule une version de consentement périmée. */
  consentVersion?: string;
};

function installFakeWindow(opts: FakeWindowOpts = {}) {
  const href = opts.href ?? 'https://owwomenscup.fr/';
  const url = new URL(href);
  const localStorage = createStorage();
  const sessionStorage = createStorage();

  if (opts.analyticsConsent !== undefined) {
    localStorage.setItem(
      'cookie_consent',
      JSON.stringify({
        version: opts.consentVersion ?? '1.0',
        preferences: {
          essential: true,
          functional: false,
          analytics: opts.analyticsConsent,
          marketing: false,
        },
        consentDate: '2026-08-23T00:00:00.000Z',
      })
    );
  }

  const fakeWindow = {
    localStorage,
    sessionStorage,
    location: {
      href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      host: url.host,
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = { referrer: opts.referrer ?? '' };
  return fakeWindow;
}

function uninstallFakeWindow() {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
}

const ENV_KEYS = [
  'NEXT_PUBLIC_ANALYTICS_PROVIDER',
  'NEXT_PUBLIC_ANALYTICS_HOST',
  'NEXT_PUBLIC_ANALYTICS_SITE_ID',
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  resetAnalyticsQueueForTests();
});

afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  });
  uninstallFakeWindow();
  resetAnalyticsQueueForTests();
});

// --- config ----------------------------------------------------------------

describe('buildAnalyticsConfig', () => {
  it('construit une config Plausible en mode manuel', () => {
    const config = buildAnalyticsConfig({
      provider: 'plausible',
      host: 'https://plausible.io/',
      siteId: 'owwomenscup.fr',
    });
    expect(config).toEqual({
      provider: 'plausible',
      host: 'https://plausible.io',
      siteId: 'owwomenscup.fr',
      // `.manual` : sans ça le script suivrait les navigations tout seul et
      // chaque route serait comptée deux fois.
      scriptSrc: 'https://plausible.io/js/script.manual.js',
    });
  });

  it('construit une config Umami', () => {
    const config = buildAnalyticsConfig({
      provider: 'UMAMI',
      host: 'https://stats.owwomenscup.fr',
      siteId: 'a1b2c3',
    });
    expect(config?.provider).toBe('umami');
    expect(config?.scriptSrc).toBe('https://stats.owwomenscup.fr/script.js');
  });

  it('renvoie null sur toute config incomplète ou inconnue', () => {
    const base = {
      provider: 'plausible',
      host: 'https://plausible.io',
      siteId: 'x',
    };
    expect(buildAnalyticsConfig({ ...base, provider: 'ga4' })).toBeNull();
    expect(buildAnalyticsConfig({ ...base, host: '' })).toBeNull();
    expect(buildAnalyticsConfig({ ...base, siteId: '  ' })).toBeNull();
    // Origine relative : impossible à autoriser dans la CSP.
    expect(buildAnalyticsConfig({ ...base, host: '/stats' })).toBeNull();
    expect(buildAnalyticsConfig({})).toBeNull();
  });

  it("readAnalyticsConfig renvoie null quand l'environnement est vierge", () => {
    expect(readAnalyticsConfig()).toBeNull();
  });
});

// --- CSP -------------------------------------------------------------------

describe('sanitizeAnalyticsOrigin (injection CSP)', () => {
  it('accepte une origine https simple, avec ou sans port', () => {
    expect(sanitizeAnalyticsOrigin('https://plausible.io')).toBe(
      'https://plausible.io'
    );
    expect(sanitizeAnalyticsOrigin('https://stats.local:3001/')).toBe(
      'https://stats.local:3001'
    );
  });

  it('rejette tout ce qui pourrait clore ou détourner la directive', () => {
    // Chaque valeur ci-dessous, insérée telle quelle, casserait la CSP.
    for (const evil of [
      "https://evil.fr; script-src 'unsafe-inline'",
      'https://evil.fr /*',
      "https://evil.fr'",
      'https://plausible.io/js/script.js',
      'http://plausible.io',
      'javascript:alert(1)',
      '*',
      '',
      undefined,
    ]) {
      expect(sanitizeAnalyticsOrigin(evil)).toBe('');
    }
  });
});

// --- consentement ----------------------------------------------------------

describe('hasAnalyticsConsent', () => {
  it('est faux côté serveur (pas de window)', () => {
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('est faux tant que rien n’a été consenti', () => {
    installFakeWindow();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('est faux quand la catégorie analytics est refusée', () => {
    installFakeWindow({ analyticsConsent: false });
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('est vrai quand la catégorie analytics est acceptée', () => {
    installFakeWindow({ analyticsConsent: true });
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('est faux si le consentement stocké est d’une version périmée', () => {
    installFakeWindow({ analyticsConsent: true, consentVersion: '0.9' });
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('est faux si localStorage est illisible ou corrompu', () => {
    const w = installFakeWindow();
    w.localStorage.setItem('cookie_consent', '{ pas du json');
    expect(hasAnalyticsConsent()).toBe(false);

    (globalThis as any).window.localStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(hasAnalyticsConsent()).toBe(false);
  });
});

// --- attribution -----------------------------------------------------------

describe('parseAttribution', () => {
  it('extrait les utm_* et ne garde du referrer que l’hôte', () => {
    expect(
      parseAttribution(
        'https://owwomenscup.fr/inscription-2026?utm_source=twitch&utm_medium=stream&utm_campaign=cup2026',
        'https://www.twitch.tv/womens_cup/videos/123'
      )
    ).toEqual({
      source: 'twitch',
      medium: 'stream',
      campaign: 'cup2026',
      referrer: 'www.twitch.tv',
      landing: '/inscription-2026',
    });
  });

  it('ignore un referrer interne (ce n’est pas une acquisition)', () => {
    expect(
      parseAttribution(
        'https://owwomenscup.fr/register',
        'https://owwomenscup.fr/inscription-2026'
      )
    ).toBeNull();
  });

  it('ne retient jamais la query de la page d’atterrissage', () => {
    const parsed = parseAttribution(
      'https://owwomenscup.fr/team/create?tournament=abc&utm_source=discord',
      null
    );
    expect(parsed?.landing).toBe('/team/create');
    expect(JSON.stringify(parsed)).not.toContain('tournament=abc');
  });

  it('renvoie null quand il n’y a aucun signal (visite directe)', () => {
    expect(parseAttribution('https://owwomenscup.fr/', '')).toBeNull();
    expect(parseAttribution('pas-une-url', null)).toBeNull();
  });

  it('borne la longueur des champs (ils partent en metadata de compte)', () => {
    const parsed = parseAttribution(
      `https://owwomenscup.fr/?utm_source=${'a'.repeat(500)}`,
      null
    );
    expect(parsed?.source).toHaveLength(120);
  });
});

describe('captureAttribution / readStoredAttribution', () => {
  it('ne stocke rien sans consentement analytics', () => {
    const w = installFakeWindow({
      href: 'https://owwomenscup.fr/?utm_source=tiktok',
      analyticsConsent: false,
    });
    captureAttribution();
    expect(w.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    expect(readStoredAttribution()).toBeNull();
  });

  it('mémorise la première touche et ne l’écrase jamais', () => {
    const w = installFakeWindow({
      href: 'https://owwomenscup.fr/?utm_source=tiktok',
      analyticsConsent: true,
    });
    captureAttribution();
    expect(readStoredAttribution()?.source).toBe('tiktok');
    expect(readStoredAttribution()?.at).toBeTruthy();

    // Deuxième page, autre campagne : la première touche prime.
    w.location.href = 'https://owwomenscup.fr/register?utm_source=discord';
    captureAttribution();
    expect(readStoredAttribution()?.source).toBe('tiktok');
  });

  it('resolveSignupSource retombe sur l’URL courante sans consentement', () => {
    installFakeWindow({
      href: 'https://owwomenscup.fr/register?utm_source=discord',
      analyticsConsent: false,
    });
    // Chemin sans consentement : lecture de l'URL, aucune écriture.
    expect(resolveSignupSource()).toMatchObject({ source: 'discord' });
    expect(readStoredAttribution()).toBeNull();
  });

  it('resolveSignupSource préfère la première touche mémorisée', () => {
    const w = installFakeWindow({
      href: 'https://owwomenscup.fr/?utm_source=tiktok',
      analyticsConsent: true,
    });
    captureAttribution();
    w.location.href = 'https://owwomenscup.fr/register';
    expect(resolveSignupSource()?.source).toBe('tiktok');
  });
});

// --- envoi -----------------------------------------------------------------

describe('trackEvent / trackPageview', () => {
  function configurePlausible() {
    process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER = 'plausible';
    process.env.NEXT_PUBLIC_ANALYTICS_HOST = 'https://plausible.io';
    process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID = 'owwomenscup.fr';
  }

  it('n’envoie rien sans consentement, même configuré', () => {
    configurePlausible();
    const w = installFakeWindow({ analyticsConsent: false }) as any;
    w.plausible = vi.fn();
    markAnalyticsReady();

    trackEvent(ANALYTICS_EVENTS.registerDone);
    trackPageview('/register');
    expect(w.plausible).not.toHaveBeenCalled();
  });

  it('n’envoie rien avec consentement mais sans fournisseur configuré', () => {
    const w = installFakeWindow({ analyticsConsent: true }) as any;
    w.plausible = vi.fn();
    markAnalyticsReady();

    trackEvent(ANALYTICS_EVENTS.teamCreated);
    expect(w.plausible).not.toHaveBeenCalled();
  });

  it('envoie événements et pageviews à Plausible', () => {
    configurePlausible();
    const w = installFakeWindow({
      href: 'https://owwomenscup.fr/register',
      analyticsConsent: true,
    }) as any;
    w.plausible = vi.fn();
    markAnalyticsReady();

    trackEvent(ANALYTICS_EVENTS.registerStart, { account_type: 'player' });
    expect(w.plausible).toHaveBeenCalledWith('register_start', {
      props: { account_type: 'player' },
    });

    trackPageview('/inscription-2026');
    expect(w.plausible).toHaveBeenLastCalledWith('pageview', {
      u: 'https://owwomenscup.fr/inscription-2026',
    });
  });

  it('envoie à Umami quand c’est le fournisseur retenu', () => {
    process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER = 'umami';
    process.env.NEXT_PUBLIC_ANALYTICS_HOST = 'https://stats.owwomenscup.fr';
    process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID = 'a1b2c3';
    const w = installFakeWindow({ analyticsConsent: true }) as any;
    w.umami = { track: vi.fn() };
    markAnalyticsReady();

    trackEvent(ANALYTICS_EVENTS.checkinDone);
    expect(w.umami.track).toHaveBeenCalledWith('checkin_done', undefined);
  });

  it('tamponne les événements émis avant le chargement du script, puis les rejoue', () => {
    configurePlausible();
    const w = installFakeWindow({ analyticsConsent: true }) as any;
    w.plausible = vi.fn();

    // Script pas encore prêt : rien ne part…
    trackEvent(ANALYTICS_EVENTS.registerStart);
    expect(w.plausible).not.toHaveBeenCalled();

    // …mais rien n'est perdu.
    markAnalyticsReady();
    expect(w.plausible).toHaveBeenCalledWith('register_start', undefined);
  });

  it('ne casse jamais la page si le collecteur lève', () => {
    configurePlausible();
    const w = installFakeWindow({ analyticsConsent: true }) as any;
    w.plausible = () => {
      throw new Error('bloqué par une extension');
    };
    markAnalyticsReady();

    expect(() => trackEvent(ANALYTICS_EVENTS.newsletterSubmit)).not.toThrow();
    expect(() => trackPageview()).not.toThrow();
  });
});
