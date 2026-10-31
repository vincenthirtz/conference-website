// Relais même-origine /api/* → conference-api : logique pure partagée,
// utilisée par le Worker (cloudflare/worker.mjs).
//
// Les invariants qui comptent :
//   - SANS variables (ou secret absent, ou origine invalide), rien n’est
//     relayé : la requête reste au site.
//   - Un client ne peut jamais forger les en-têtes X-Owwc-* du relais.
//   - Plusieurs Set-Cookie amont reviennent séparés, jamais fusionnés.

import { describe, expect, it } from 'vitest';
import {
  askApiWorker,
  buildDownstreamHeaders,
  buildUpstreamHeaders,
  buildUpstreamUrl,
  DEFAULT_API_PROXY_ORIGIN,
  isNeverProxiedPath,
  isNullBodyStatus,
  matchesProxyPrefix,
  methodHasBody,
  parseProxyPrefixes,
  resolveEdgeProxyConfig,
  servedByApiWorker,
  upstreamUnavailableResponse,
} from '@/utils/edgeApiProxy';

const SECRET = 's3cr3t-edge-value';

describe('Worker de l’API : qui y part', () => {
  const prefixes = parseProxyPrefixes('/api/health,/api/public/');

  it('les lectures des préfixes listés', () => {
    expect(servedByApiWorker('GET', '/api/health', prefixes)).toBe(true);
    expect(servedByApiWorker('HEAD', '/api/public/tcg/live', prefixes)).toBe(
      true
    );
  });

  it('jamais une écriture, même sur un préfixe listé', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(
        servedByApiWorker(method, '/api/public/newsletter', prefixes)
      ).toBe(false);
    }
  });

  it('rien hors des préfixes, ni avec une liste vide', () => {
    expect(servedByApiWorker('GET', '/api/admin/me', prefixes)).toBe(false);
    expect(
      servedByApiWorker('GET', '/api/health', parseProxyPrefixes(undefined))
    ).toBe(false);
    expect(
      servedByApiWorker('GET', '/api/health', parseProxyPrefixes(''))
    ).toBe(false);
  });

  it('jamais /api/internal, même si un préfixe le couvre', () => {
    expect(
      servedByApiWorker(
        'GET',
        '/api/internal/revalidate',
        parseProxyPrefixes('/api/')
      )
    ).toBe(false);
  });
});

describe('Worker de l’API : repli sur le serveur', () => {
  const url = 'https://api.owwomenscup.fr/api/health';
  const init = { method: 'GET' };
  const ask = (
    fetch: (url: string, init: RequestInit) => Promise<Response>,
    timeoutMs?: number
  ) => {
    const reasons: string[] = [];
    return askApiWorker(
      { fetch },
      url,
      init,
      (reason) => reasons.push(reason),
      timeoutMs
    ).then((response) => ({ response, reasons }));
  };

  it('rend sa réponse telle quelle, sans trace', async () => {
    const answer = new Response('ok', { status: 200 });
    const { response, reasons } = await ask(async (calledUrl, calledInit) => {
      expect(calledUrl).toBe(url);
      expect(calledInit).toBe(init);
      return answer;
    });
    expect(response).toBe(answer);
    expect(reasons).toEqual([]);
  });

  it('rend aussi ses 4xx et ses redirections : ce sont des réponses', async () => {
    for (const status of [301, 304, 400, 404, 429]) {
      const { response, reasons } = await ask(
        async () => new Response(null, { status })
      );
      expect(response?.status).toBe(status);
      expect(reasons).toEqual([]);
    }
  });

  it('une 5xx : repli, corps refermé, trace', async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const { response, reasons } = await ask(
      async () => new Response(body, { status: 503 })
    );
    expect(response).toBeNull();
    expect(cancelled).toBe(true);
    expect(reasons).toEqual(['statut 503']);
  });

  it('une exception : repli et trace', async () => {
    const { response, reasons } = await ask(async () => {
      throw new Error('liaison coupée');
    });
    expect(response).toBeNull();
    expect(reasons).toEqual(['liaison coupée']);
  });

  it('aucune réponse à temps : repli et trace', async () => {
    const { response, reasons } = await ask(
      () => new Promise<Response>(() => {}),
      5
    );
    expect(response).toBeNull();
    expect(reasons).toEqual(['délai de 5 ms']);
  });
});

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

describe('/api/internal/* jamais relayé', () => {
  it.each([
    '/api/internal/revalidate',
    '/api/internal',
    '/api/internal/autre',
    '/api/%69nternal/revalidate',
    '/API/Internal/revalidate',
  ])('%s exclu même avec le préfixe /api/', (path) => {
    expect(isNeverProxiedPath(path)).toBe(true);
    expect(matchesProxyPrefix(path, ['/api/'])).toBe(false);
    expect(matchesProxyPrefix(path, ['/api/internal/'])).toBe(false);
  });
  it.each(['/api/internals/x', '/api/onboard/internal', '/api/internalx'])(
    '%s reste relayable',
    (path) => {
      expect(isNeverProxiedPath(path)).toBe(false);
      expect(matchesProxyPrefix(path, ['/api/'])).toBe(true);
    }
  );
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
