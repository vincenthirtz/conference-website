// tests/unit/defineTokenRoute.test.ts — la route déclarative d'un JETON
// public (lot P11, docs/PLAN-industrialisation-joueur.md).
//
// Ordre de la garde : rate-limit (bucket historique, avant tout) → session
// exigée (401 d'abord) → forme du jeton → session facultative → zod →
// handler. Le cookie l'emporte sur un Bearer résiduel en `cookie-or-bearer`.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as z from 'zod';

// Le setup neutralise le rate-limit ; on l'observe ici pour vérifier l'ORDRE.
const { applyRateLimitMock } = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn((..._args: unknown[]) => false),
}));
vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: applyRateLimitMock,
  applyActorRateLimit: () => false,
  refundRateLimit: () => {},
  getClientIp: () => '127.0.0.1',
}));
import {
  resetSupabaseMock,
  setAuthUser,
  setCookieUser,
} from './__helpers__/supabaseMock';
import {
  defineTokenRoute,
  tokenMethod,
} from '../../utils/player/defineTokenRoute';

const USER = { id: '33333333-3333-4333-8333-333333333333', email: 'a@b.c' };
const COOKIE_USER = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'c@d.e',
};
const GOOD = 'x'.repeat(24);

let n = 0;
function makeReq(over: Partial<any> = {}, auth = false): any {
  n += 1;
  return {
    method: 'GET',
    url: '/api/token-test',
    headers: {
      host: 'h',
      ...(auth ? { authorization: `Bearer t-token-${n}` } : {}),
    },
    cookies: {},
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.getHeader = (k: string) => res.headers[k];
  res.end = () => res;
  return res;
}

const handler = vi.fn(async ({ ctx }: any) => ({
  token: ctx.token,
  userId: ctx.user?.id ?? null,
}));

function route(overrides: Record<string, unknown> = {}) {
  return defineTokenRoute({
    key: 'token-test',
    rateLimit: { max: 100, windowMs: 60_000 },
    token: {
      from: 'query',
      isPlausible: (v) => typeof v === 'string' && v.length >= 20,
      invalid: { status: 400, error: 'Invalid token.', code: 'INVALID_TOKEN' },
    },
    GET: tokenMethod({ session: 'none', handler }),
    POST: tokenMethod({
      session: 'required',
      tokenFrom: 'body',
      body: z.object({ token: z.string(), action: z.enum(['go']) }),
      handler,
    }),
    PATCH: tokenMethod({
      session: 'optional',
      sessionSource: 'cookie-or-bearer',
      handler,
    }),
    ...overrides,
  });
}

beforeEach(() => {
  resetSupabaseMock();
  handler.mockClear();
  setAuthUser(USER);
});

describe('defineTokenRoute', () => {
  it('expose ses métadonnées (session, source du jeton)', () => {
    const r = route();
    expect(r.tokenRoute.methods.GET).toMatchObject({
      session: 'none',
      tokenFrom: 'query',
      idempotent: false,
    });
    expect(r.tokenRoute.methods.POST).toMatchObject({
      session: 'required',
      tokenFrom: 'body',
    });
  });

  it('405 + Allow sur une méthode non déclarée', async () => {
    const res = makeRes();
    await route()(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET,POST,PATCH');
  });

  it('jeton mal formé : refus historique, handler jamais appelé', async () => {
    const res = makeRes();
    await route()(makeReq({ query: { token: 'court' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: 'Invalid token.',
      code: 'INVALID_TOKEN',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('lecture publique : sans session, jeton transmis, pas de cache', async () => {
    const res = makeRes();
    await route()(makeReq({ query: { token: GOOD } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ token: GOOD, userId: null });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('session exigée : 401 AVANT la forme du jeton', async () => {
    const res = makeRes();
    await route()(
      makeReq({ method: 'POST', body: { token: 'court', action: 'go' } }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Token required.');
    expect(handler).not.toHaveBeenCalled();
  });

  it('session exigée : jeton lu dans le corps, puis zod', async () => {
    const ok = makeRes();
    await route()(
      makeReq({ method: 'POST', body: { token: GOOD, action: 'go' } }, true),
      ok
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toEqual({ token: GOOD, userId: USER.id });

    const bad = makeRes();
    await route()(
      makeReq({ method: 'POST', body: { token: GOOD, action: 'no' } }, true),
      bad
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('validation');
  });

  it('session facultative : absente = null ; le cookie l’emporte sur le Bearer', async () => {
    const anon = makeRes();
    await route()(makeReq({ method: 'PATCH', query: { token: GOOD } }), anon);
    expect(anon.statusCode).toBe(200);
    expect(anon.body.userId).toBeNull();

    setCookieUser(COOKIE_USER);
    const both = makeRes();
    await route()(
      makeReq({ method: 'PATCH', query: { token: GOOD } }, true),
      both
    );
    expect(both.body.userId).toBe(COOKIE_USER.id);
  });

  it('rate-limit AVANT tout, sur le bucket historique déclaré', async () => {
    applyRateLimitMock.mockImplementationOnce((_req: any, res: any) => {
      res.status(429).json({ error: 'Trop de requêtes.' });
      return true;
    });
    const r = route({
      rateLimit: { max: 7, windowMs: 60_000 },
      rateLimitKey: 'legacy-bucket',
    });
    const res = makeRes();
    // Jeton mal formé ET pas de session : c'est pourtant le 429 qui répond.
    await r(makeReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(429);
    expect(applyRateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { max: 7, windowMs: 60_000 },
      'legacy-bucket'
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
