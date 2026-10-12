// Régénération ISR : helper unique `revalidatePaths` (modes local / distant)
// et route `/api/internal/revalidate` qui reçoit le mode distant.
//
// Invariants :
//   - variables absentes → `res.revalidate` par chemin, comme avant ;
//   - mode distant → un POST vers le site, secret en en-tête, jamais d'appel
//     à `res.revalidate` local (il ne régénérerait rien côté Netlify) ;
//   - best-effort partout : ni l'un ni l'autre mode ne lève ;
//   - la route : 404 sans secret configuré, 401 secret faux, 400 chemins
//     invalides, `res.revalidate` direct pour chaque chemin.

import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../pages/api/internal/revalidate';
import {
  resolveRemoteRevalidateConfig,
  revalidatePaths,
} from '@/utils/revalidate';

const REMOTE = 'https://owwomenscup.fr/api/internal/revalidate';
const SECRET = 'reval-secret-0123456789';

function fakeRes(fail: string[] = []) {
  const res = {
    revalidated: [] as string[],
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    setHeader(k: string, v: unknown) {
      res.headers[k] = v;
    },
    revalidate: vi.fn(async (path: string) => {
      if (fail.includes(path)) throw new Error(`boom ${path}`);
      res.revalidated.push(path);
    }),
  };
  return res;
}

beforeEach(() => {
  vi.stubEnv('REVALIDATE_REMOTE_URL', '');
  vi.stubEnv('REVALIDATE_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveRemoteRevalidateConfig', () => {
  it('null sans URL ou sans secret', () => {
    expect(resolveRemoteRevalidateConfig({})).toBeNull();
    expect(
      resolveRemoteRevalidateConfig({ REVALIDATE_REMOTE_URL: REMOTE })
    ).toBeNull();
    expect(
      resolveRemoteRevalidateConfig({ REVALIDATE_SECRET: SECRET })
    ).toBeNull();
  });
  it.each([
    'http://owwomenscup.fr/api/internal/revalidate',
    'https://user:pw@owwomenscup.fr/x',
    'pas une url',
    'javascript:alert(1)',
  ])('URL refusée : %s', (url) => {
    expect(
      resolveRemoteRevalidateConfig({
        REVALIDATE_REMOTE_URL: url,
        REVALIDATE_SECRET: SECRET,
      })
    ).toBeNull();
  });
  it('secret avec CR/LF refusé', () => {
    expect(
      resolveRemoteRevalidateConfig({
        REVALIDATE_REMOTE_URL: REMOTE,
        REVALIDATE_SECRET: 'a\r\nb',
      })
    ).toBeNull();
  });
  it('https + secret → config', () => {
    expect(
      resolveRemoteRevalidateConfig({
        REVALIDATE_REMOTE_URL: REMOTE,
        REVALIDATE_SECRET: SECRET,
      })
    ).toEqual({ url: REMOTE, secret: SECRET });
  });
});

describe('revalidatePaths — mode local (variables absentes)', () => {
  it('appelle res.revalidate pour chaque chemin, sans fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeRes();
    await revalidatePaths(res as never, ['/', '/actualites', '/', '']);
    expect(res.revalidated.sort()).toEqual(['/', '/actualites']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('un échec est signalé à onError sans lever', async () => {
    const res = fakeRes(['/news/x']);
    const onError = vi.fn();
    await expect(
      revalidatePaths(res as never, ['/', '/news/x'], { onError })
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBe('/news/x');
    expect(res.revalidated).toEqual(['/']);
  });

  it('sans res.revalidate (double de test) : ne fait rien', async () => {
    await expect(revalidatePaths({}, ['/'])).resolves.toBeUndefined();
    await expect(revalidatePaths(null, ['/'])).resolves.toBeUndefined();
  });
});

describe('revalidatePaths — mode distant', () => {
  beforeEach(() => {
    vi.stubEnv('REVALIDATE_REMOTE_URL', REMOTE);
    vi.stubEnv('REVALIDATE_SECRET', SECRET);
  });

  it('POSTe { paths } avec le secret, sans res.revalidate local', async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          JSON.stringify({ revalidated: ['/player/a'], failed: [] }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeRes();
    const onError = vi.fn();
    await revalidatePaths(res as never, ['/player/a'], { onError });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(REMOTE);
    expect(init.method).toBe('POST');
    expect(
      (init.headers as Record<string, string>)['x-revalidate-secret']
    ).toBe(SECRET);
    expect(JSON.parse(init.body as string)).toEqual({ paths: ['/player/a'] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(res.revalidate).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('fonctionne même sans res.revalidate (serveur API)', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ revalidated: ['/'], failed: [] }))
    );
    vi.stubGlobal('fetch', fetchSpy);
    await revalidatePaths({}, ['/']);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('chemins en échec côté site → onError par chemin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ revalidated: ['/'], failed: ['/match/1'] })
          )
      )
    );
    const onError = vi.fn();
    await revalidatePaths(fakeRes() as never, ['/', '/match/1'], { onError });
    expect(onError.mock.calls.map((c) => c[0])).toEqual(['/match/1']);
  });

  it('HTTP non 2xx → tous les chemins signalés, sans lever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 }))
    );
    const onError = vi.fn();
    await expect(
      revalidatePaths(fakeRes() as never, ['/', '/a'], { onError })
    ).resolves.toBeUndefined();
    expect(onError.mock.calls.map((c) => c[0]).sort()).toEqual(['/', '/a']);
  });

  it('erreur réseau / timeout → signalée, sans lever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('timeout', 'TimeoutError');
      })
    );
    const onError = vi.fn();
    await expect(
      revalidatePaths(fakeRes() as never, ['/'], { onError })
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('découpe au-delà de 50 chemins', async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ revalidated: [], failed: [] }))
    );
    vi.stubGlobal('fetch', fetchSpy);
    const paths = Array.from({ length: 120 }, (_, i) => `/p/${i}`);
    await revalidatePaths({}, paths);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('URL http → retombe en mode local', async () => {
    vi.stubEnv('REVALIDATE_REMOTE_URL', 'http://owwomenscup.fr/x');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeRes();
    await revalidatePaths(res as never, ['/']);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.revalidated).toEqual(['/']);
  });
});

describe('POST /api/internal/revalidate', () => {
  function call(opts: {
    method?: string;
    secret?: string;
    body?: unknown;
    fail?: string[];
  }) {
    const req = {
      method: opts.method ?? 'POST',
      headers: opts.secret ? { 'x-revalidate-secret': opts.secret } : {},
      body: opts.body,
    } as unknown as NextApiRequest;
    const res = fakeRes(opts.fail);
    return handler(req, res as unknown as NextApiResponse).then(() => res);
  }

  it('REVALIDATE_SECRET absent → 404, rien régénéré', async () => {
    const res = await call({ secret: 'x', body: { paths: ['/'] } });
    expect(res.statusCode).toBe(404);
    expect(res.revalidate).not.toHaveBeenCalled();
  });

  describe('secret configuré', () => {
    beforeEach(() => vi.stubEnv('REVALIDATE_SECRET', SECRET));

    it('méthode autre que POST → 405 + Allow', async () => {
      const res = await call({ method: 'GET', secret: SECRET });
      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('POST');
    });

    it('secret absent ou faux → 401', async () => {
      const a = await call({ body: { paths: ['/'] } });
      const b = await call({ secret: `${SECRET}x`, body: { paths: ['/'] } });
      const c = await call({ secret: 'court', body: { paths: ['/'] } });
      for (const r of [a, b, c]) {
        expect(r.statusCode).toBe(401);
        expect(r.revalidate).not.toHaveBeenCalled();
      }
    });

    it.each([
      [undefined],
      [{}],
      [{ paths: [] }],
      [{ paths: 'x' }],
      [{ paths: ['player/x'] }],
      [{ paths: ['//evil.example/x'] }],
      [{ paths: ['/a//b'] }],
      [{ paths: ['https://evil.example/x'] }],
      [{ paths: ['/a b'] }],
      [{ paths: ['/a?x=1'] }],
      [{ paths: ['/a\\b'] }],
      [{ paths: [42] }],
      [{ paths: Array.from({ length: 51 }, (_, i) => `/p/${i}`) }],
    ])('corps invalide %j → 400', async (body) => {
      const res = await call({ secret: SECRET, body });
      expect(res.statusCode).toBe(400);
      expect(res.revalidate).not.toHaveBeenCalled();
    });

    it('bon secret → res.revalidate par chemin, rapport revalidated/failed', async () => {
      const res = await call({
        secret: SECRET,
        body: { paths: ['/', '/player/abc', '/news/gone', '/'] },
        fail: ['/news/gone'],
      });
      expect(res.statusCode).toBe(200);
      expect(res.revalidate).toHaveBeenCalledTimes(3);
      const body = res.body as { revalidated: string[]; failed: string[] };
      expect(body.revalidated.sort()).toEqual(['/', '/player/abc']);
      expect(body.failed).toEqual(['/news/gone']);
    });

    it('50 chemins acceptés', async () => {
      const paths = Array.from({ length: 50 }, (_, i) => `/p/${i}`);
      const res = await call({ secret: SECRET, body: { paths } });
      expect(res.statusCode).toBe(200);
      expect(res.revalidate).toHaveBeenCalledTimes(50);
    });
  });
});
