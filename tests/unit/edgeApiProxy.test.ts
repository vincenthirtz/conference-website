// Relais même-origine /api/* → conference-api (Edge Function Netlify).
//
// Les invariants qui comptent :
//   - SANS variables (ou secret absent, ou origine invalide), rien ne change :
//     la requête poursuit vers la fonction serveur Next (`context.next()`).
//   - Un client ne peut jamais forger les en-têtes X-Owwc-* du relais.
//   - Plusieurs Set-Cookie amont reviennent séparés, jamais fusionnés.

import { afterEach, describe, expect, it, vi } from 'vitest';
import apiProxy from '../../netlify/edge-functions/api-proxy';
import {
  buildDownstreamHeaders,
  buildUpstreamHeaders,
  buildUpstreamUrl,
  DEFAULT_API_PROXY_ORIGIN,
  isNullBodyStatus,
  matchesProxyPrefix,
  methodHasBody,
  parseProxyPrefixes,
  resolveEdgeProxyConfig,
  upstreamUnavailableResponse,
} from '@/utils/edgeApiProxy';

const SECRET = 's3cr3t-edge-value';

describe('parseProxyPrefixes', () => {
  it('garde les préfixes /api/ valides, ignore le reste', () => {
    expect(
      parseProxyPrefixes(
        ' /api/onboard/ , /api/twitch/,api/x/, /pages/, /api/a b/, /api/q?x, '
      )
    ).toEqual(['/api/onboard/', '/api/twitch/']);
  });
  it('vide sans valeur', () => {
    expect(parseProxyPrefixes(undefined)).toEqual([]);
    expect(parseProxyPrefixes(' , ')).toEqual([]);
  });
});

describe('resolveEdgeProxyConfig', () => {
  const base = {
    prefixes: '/api/onboard/',
    origin: undefined,
    secret: SECRET,
  };

  it('origine par défaut quand API_PROXY_ORIGIN est absente', () => {
    expect(resolveEdgeProxyConfig(base)).toEqual({
      origin: DEFAULT_API_PROXY_ORIGIN,
      prefixes: ['/api/onboard/'],
      secret: SECRET,
    });
    expect(resolveEdgeProxyConfig({ ...base, origin: '  ' })?.origin).toBe(
      DEFAULT_API_PROXY_ORIGIN
    );
  });

  it('accepte une origine https et retire le slash final', () => {
    expect(
      resolveEdgeProxyConfig({ ...base, origin: 'https://api.example.fr/' })
        ?.origin
    ).toBe('https://api.example.fr');
  });

  it.each([
    ['secret absent', { ...base, secret: undefined }],
    ['secret vide', { ...base, secret: '   ' }],
    ['secret avec saut de ligne', { ...base, secret: 'a\r\nX-Evil: 1' }],
    ['préfixes absents', { ...base, prefixes: undefined }],
    ['préfixes invalides', { ...base, prefixes: '/pages/, api/' }],
    ['origine http', { ...base, origin: 'http://api.owwomenscup.fr' }],
    ['origine avec chemin', { ...base, origin: 'https://api.x.fr/api' }],
  ])('null : %s', (_label, raw) => {
    expect(resolveEdgeProxyConfig(raw)).toBeNull();
  });
});

describe('matchesProxyPrefix', () => {
  const prefixes = ['/api/onboard/', '/api/auth/'];
  it.each([
    ['/api/onboard/step', true],
    ['/api/auth/discord/callback', true],
    ['/api/onboard', false],
    ['/api/admin/teams', false],
    ['/api/onboardx/step', false],
    ['/onboard/api/onboard/', false],
  ])('%s → %s', (path, expected) => {
    expect(matchesProxyPrefix(path, prefixes)).toBe(expected);
  });
});

describe('buildUpstreamUrl', () => {
  it('chemin + query, sans fragment', () => {
    const url = new URL('https://owwomenscup.fr/api/auth/cb?code=1&s=2#frag');
    expect(buildUpstreamUrl(DEFAULT_API_PROXY_ORIGIN, url)).toBe(
      'https://api.owwomenscup.fr/api/auth/cb?code=1&s=2'
    );
  });
});

describe('buildUpstreamHeaders', () => {
  const meta = {
    secret: SECRET,
    clientIp: '203.0.113.7',
    host: 'owwomenscup.fr',
  };

  it('copie les en-têtes métier, retire hop-by-hop et host', () => {
    const out = buildUpstreamHeaders(
      new Headers({
        cookie: 'sb-a=1; tenant=x',
        authorization: 'Bearer t',
        'content-type': 'application/json',
        host: 'owwomenscup.fr',
        connection: 'keep-alive, X-Custom-Hop',
        'keep-alive': 'timeout=5',
        'x-custom-hop': 'drop-me',
        te: 'trailers',
        upgrade: 'h2c',
        'proxy-authorization': 'Basic x',
        'transfer-encoding': 'chunked',
      }),
      meta
    );
    expect(out.get('cookie')).toBe('sb-a=1; tenant=x');
    expect(out.get('authorization')).toBe('Bearer t');
    expect(out.get('content-type')).toBe('application/json');
    for (const name of [
      'host',
      'connection',
      'keep-alive',
      'x-custom-hop',
      'te',
      'upgrade',
      'proxy-authorization',
      'transfer-encoding',
    ]) {
      expect(out.has(name), name).toBe(false);
    }
  });

  it('remplace tout X-Owwc-* client par les valeurs du relais', () => {
    const out = buildUpstreamHeaders(
      new Headers({
        'X-Owwc-Edge': 'forged',
        'x-owwc-client-ip': '1.1.1.1',
        'X-OWWC-Host': 'evil.example',
        'x-owwc-other': 'nope',
      }),
      meta
    );
    expect(out.get('x-owwc-edge')).toBe(SECRET);
    expect(out.get('x-owwc-client-ip')).toBe('203.0.113.7');
    expect(out.get('x-owwc-host')).toBe('owwomenscup.fr');
    expect(out.has('x-owwc-other')).toBe(false);
  });

  it('force accept-encoding: identity', () => {
    const out = buildUpstreamHeaders(
      new Headers({ 'accept-encoding': 'gzip, br' }),
      meta
    );
    expect(out.get('accept-encoding')).toBe('identity');
  });

  it("omet l'IP client si absente ou invalide", () => {
    expect(
      buildUpstreamHeaders(new Headers(), { ...meta, clientIp: undefined }).has(
        'x-owwc-client-ip'
      )
    ).toBe(false);
    expect(
      buildUpstreamHeaders(new Headers(), { ...meta, clientIp: 'a\nb' }).has(
        'x-owwc-client-ip'
      )
    ).toBe(false);
  });
});

describe('buildDownstreamHeaders', () => {
  it('garde chaque Set-Cookie séparé (dates Expires avec virgule)', () => {
    const upstream = new Headers();
    upstream.append(
      'set-cookie',
      'sb-access=a; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly'
    );
    upstream.append('set-cookie', 'tenant=b; Path=/; SameSite=Lax');
    upstream.append('set-cookie', 'oauth_state=; Max-Age=0');
    const out = buildDownstreamHeaders(upstream);
    expect(out.getSetCookie()).toEqual([
      'sb-access=a; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly',
      'tenant=b; Path=/; SameSite=Lax',
      'oauth_state=; Max-Age=0',
    ]);
  });

  it('conserve Cache-Control, Location, content-length ; retire hop-by-hop', () => {
    const out = buildDownstreamHeaders(
      new Headers({
        'cache-control': 'private, no-store',
        location: 'https://discord.com/oauth2/authorize?x=1',
        'content-type': 'application/json',
        'content-length': '42',
        connection: 'close',
        'transfer-encoding': 'chunked',
        'keep-alive': 'timeout=5',
      })
    );
    expect(out.get('cache-control')).toBe('private, no-store');
    expect(out.get('location')).toBe(
      'https://discord.com/oauth2/authorize?x=1'
    );
    expect(out.get('content-length')).toBe('42');
    expect(out.has('connection')).toBe(false);
    expect(out.has('transfer-encoding')).toBe(false);
    expect(out.has('keep-alive')).toBe(false);
  });

  it("retire content-length si l'amont a compressé malgré identity", () => {
    const out = buildDownstreamHeaders(
      new Headers({ 'content-encoding': 'gzip', 'content-length': '10' })
    );
    expect(out.get('content-encoding')).toBe('gzip');
    expect(out.has('content-length')).toBe(false);
  });
});

describe('petits prédicats', () => {
  it('methodHasBody', () => {
    expect(methodHasBody('GET')).toBe(false);
    expect(methodHasBody('head')).toBe(false);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(methodHasBody(m), m).toBe(true);
    }
  });
  it('isNullBodyStatus', () => {
    expect([101, 204, 205, 304].every(isNullBodyStatus)).toBe(true);
    expect([200, 302, 404, 502].some(isNullBodyStatus)).toBe(false);
  });
  it('upstreamUnavailableResponse', async () => {
    const res = upstreamUnavailableResponse();
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'Upstream unavailable' });
  });
});

describe('edge function api-proxy', () => {
  const NEXT = new Response('from-next', { status: 299 });

  function stubEnv(env: Record<string, string | undefined>) {
    vi.stubGlobal('Netlify', { env: { get: (k: string) => env[k] } });
  }
  function ctx() {
    return { ip: '198.51.100.4', next: vi.fn(async () => NEXT) };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sans Netlify global (local), rend la main sans fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const c = ctx();
    const res = await apiProxy(
      new Request('https://owwomenscup.fr/api/onboard/x'),
      c
    );
    expect(res).toBe(NEXT);
    expect(c.next).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('secret absent → context.next()', async () => {
    stubEnv({ API_PROXY_PREFIXES: '/api/onboard/' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const c = ctx();
    await apiProxy(new Request('https://owwomenscup.fr/api/onboard/x'), c);
    expect(c.next).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('chemin hors préfixe → context.next()', async () => {
    stubEnv({ API_PROXY_PREFIXES: '/api/onboard/', EDGE_PROXY_SECRET: SECRET });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const c = ctx();
    await apiProxy(new Request('https://owwomenscup.fr/api/admin/teams'), c);
    expect(c.next).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('relaie méthode, corps, en-têtes et renvoie la réponse amont', async () => {
    stubEnv({ API_PROXY_PREFIXES: '/api/onboard/', EDGE_PROXY_SECRET: SECRET });
    const upstreamHeaders = new Headers({ 'content-type': 'application/json' });
    upstreamHeaders.append('set-cookie', 'a=1; Path=/');
    upstreamHeaders.append('set-cookie', 'b=2; Path=/');
    const fetchSpy = vi.fn(
      async (_url: string, _init: RequestInit & { duplex?: string }) =>
        new Response('{"ok":true}', {
          status: 201,
          headers: upstreamHeaders,
        })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const c = ctx();
    const res = await apiProxy(
      new Request('https://owwomenscup.fr/api/onboard/step?x=1', {
        method: 'POST',
        body: '{"step":2}',
        headers: {
          'content-type': 'application/json',
          cookie: 'sb=1',
          'x-owwc-edge': 'forged',
        },
      }),
      c
    );

    expect(c.next).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.owwomenscup.fr/api/onboard/step?x=1');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.duplex).toBe('half');
    expect(await new Response(init.body).text()).toBe('{"step":2}');
    const sent = init.headers as Headers;
    expect(sent.get('x-owwc-edge')).toBe(SECRET);
    expect(sent.get('x-owwc-client-ip')).toBe('198.51.100.4');
    expect(sent.get('x-owwc-host')).toBe('owwomenscup.fr');
    expect(sent.get('cookie')).toBe('sb=1');

    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET : ni corps ni duplex ; 3xx renvoyé tel quel', async () => {
    stubEnv({
      API_PROXY_PREFIXES: '/api/auth/',
      API_PROXY_ORIGIN: 'https://api.example.fr',
      EDGE_PROXY_SECRET: SECRET,
    });
    const fetchSpy = vi.fn(
      async (_url: string, _init: RequestInit & { duplex?: string }) =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://discord.com/oauth2/authorize' },
        })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const res = await apiProxy(
      new Request('https://owwomenscup.fr/api/auth/discord'),
      ctx()
    );
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.example.fr/api/auth/discord');
    expect(init.body).toBeUndefined();
    expect(init.duplex).toBeUndefined();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://discord.com/oauth2/authorize'
    );
  });

  it('204 amont : réponse sans corps', async () => {
    stubEnv({ API_PROXY_PREFIXES: '/api/onboard/', EDGE_PROXY_SECRET: SECRET });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    const res = await apiProxy(
      new Request('https://owwomenscup.fr/api/onboard/x', { method: 'DELETE' }),
      ctx()
    );
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('erreur réseau amont → 502 JSON', async () => {
    stubEnv({ API_PROXY_PREFIXES: '/api/onboard/', EDGE_PROXY_SECRET: SECRET });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('connection refused');
      })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await apiProxy(
      new Request('https://owwomenscup.fr/api/onboard/x'),
      ctx()
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Upstream unavailable' });
  });
});
