// Bascule des appels navigateur vers l'API distante (utils/remoteApi.ts).
//
// L'invariant qui compte : SANS variables, rien ne change (pas de réécriture,
// fetch natif intact, CSP byte-identique). Et les familles qui lisent un
// cookie du site ne partent jamais vers l'API distante.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRemoteApiConfig,
  installRemoteApiFetch,
  remoteApiUrl,
  sanitizeApiOrigin,
} from '@/utils/remoteApi';

const PAGE = 'https://owwomenscup.fr';
const API = 'https://api.owwomenscup.fr';

describe('sanitizeApiOrigin', () => {
  it('accepte une origine https et retire le slash final', () => {
    expect(sanitizeApiOrigin('https://api.owwomenscup.fr/')).toBe(API);
  });
  it.each([
    undefined,
    '',
    'http://api.owwomenscup.fr',
    'https://api.owwomenscup.fr/api',
    "https://x.fr; script-src 'unsafe-inline'",
    'javascript:alert(1)',
  ])('refuse %s', (raw) => {
    expect(sanitizeApiOrigin(raw)).toBe('');
  });
});

describe('buildRemoteApiConfig', () => {
  it('null sans origine ou sans préfixe', () => {
    expect(buildRemoteApiConfig(undefined, '/api/public/')).toBeNull();
    expect(buildRemoteApiConfig(API, undefined)).toBeNull();
    expect(buildRemoteApiConfig(API, ' , ')).toBeNull();
  });

  it('garde les préfixes /api/ valides', () => {
    expect(buildRemoteApiConfig(API, '/api/public/, /api/news')).toEqual({
      origin: API,
      prefixes: ['/api/public/', '/api/news'],
    });
  });

  it('écarte les familles liées aux cookies, y compris un préfixe trop large', () => {
    expect(
      buildRemoteApiConfig(API, '/api/admin/,/api/auth/x,/api/,/api/public/')
    ).toEqual({ origin: API, prefixes: ['/api/public/'] });
  });

  it('écarte ce qui ne commence pas par /api/', () => {
    expect(
      buildRemoteApiConfig(API, 'api/public/,/public/,/api/x?y')
    ).toBeNull();
  });
});

describe('remoteApiUrl', () => {
  const cfg = { origin: API, prefixes: ['/api/public/', '/api/news'] };

  it('réécrit un chemin relatif d’une famille basculée, query comprise', () => {
    expect(remoteApiUrl('/api/public/v1/teams?x=1', cfg, PAGE)).toBe(
      `${API}/api/public/v1/teams?x=1`
    );
  });

  it('réécrit une URL absolue de la page courante', () => {
    expect(remoteApiUrl(`${PAGE}/api/news/rss`, cfg, PAGE)).toBe(
      `${API}/api/news/rss`
    );
  });

  it('laisse les familles non basculées', () => {
    expect(remoteApiUrl('/api/site-settings', cfg, PAGE)).toBeNull();
  });

  it('ne touche jamais un tiers ni un chemin hors /api/', () => {
    expect(
      remoteApiUrl('https://evil.example/api/public/x', cfg, PAGE)
    ).toBeNull();
    expect(remoteApiUrl('/public/x', cfg, PAGE)).toBeNull();
    expect(remoteApiUrl('not a url', cfg, PAGE)).toBeNull();
  });

  it('refuse une famille à cookies même si la config l’inclut', () => {
    const forced = { origin: API, prefixes: ['/api/'] };
    expect(remoteApiUrl('/api/admin/me', forced, PAGE)).toBeNull();
    expect(remoteApiUrl('/api/auth/twitch/start', forced, PAGE)).toBeNull();
  });
});

describe('installRemoteApiFetch', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = realFetch;
  });

  it('sans config : fetch natif intact', () => {
    const native = vi.fn();
    vi.stubGlobal('window', { fetch: native, location: { origin: PAGE } });
    installRemoteApiFetch(null);
    expect(
      (globalThis as unknown as { window: { fetch: unknown } }).window.fetch
    ).toBe(native);
  });

  it('avec config : réécrit les familles basculées, laisse le reste', async () => {
    const native = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{}')
    );
    const win = {
      fetch: native,
      location: { origin: PAGE },
    } as unknown as Window;
    vi.stubGlobal('window', win);
    installRemoteApiFetch({ origin: API, prefixes: ['/api/public/'] });

    await win.fetch('/api/public/v1/teams', { method: 'GET' });
    await win.fetch('/api/admin/me');
    await win.fetch(new URL(`${PAGE}/api/public/v1/leagues`));

    expect(native.mock.calls.map((c) => String(c[0]))).toEqual([
      `${API}/api/public/v1/teams`,
      '/api/admin/me',
      `${API}/api/public/v1/leagues`,
    ]);
    // init transmis tel quel : pas de credentials ajoutés
    expect(native.mock.calls[0][1]).toEqual({ method: 'GET' });
  });
});

describe('CSP connect-src', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function cspFor(env: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.doMock('next/server', () => ({
      NextResponse: { next: () => ({ headers: new Headers() }) },
    }));
    const { proxy } = await import('../../proxy');
    const req = {
      nextUrl: new URL('https://owwomenscup.fr/'),
      headers: new Headers(),
    } as unknown as Parameters<typeof proxy>[0];
    const res = (await proxy(req)) as unknown as { headers: Headers };
    return res.headers.get('Content-Security-Policy') ?? '';
  }

  it('sans variables : aucune origine d’API ajoutée', async () => {
    const csp = await cspFor({
      NEXT_PUBLIC_API_BASE_URL: '',
      NEXT_PUBLIC_API_REMOTE_PREFIXES: '',
    });
    expect(csp).not.toContain('api.owwomenscup.fr');
  });

  it('avec une famille basculée : origine de l’API en connect-src', async () => {
    const csp = await cspFor({
      NEXT_PUBLIC_API_BASE_URL: API,
      NEXT_PUBLIC_API_REMOTE_PREFIXES: '/api/public/',
    });
    const connect = csp
      .split(';')
      .find((d) => d.trim().startsWith('connect-src'));
    expect(connect).toContain(API);
  });
});
