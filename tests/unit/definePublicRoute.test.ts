// tests/unit/definePublicRoute.test.ts — la route déclarative ANONYME (lot
// P11). Ordre de la garde : rate-limits (buckets historiques, dans l'ordre)
// → 503 au code historique → honeypot → captcha → tenant public → zod →
// handler.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as z from 'zod';

const { applyRateLimitMock, verifyCaptchaMock } = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn((..._args: unknown[]) => false),
  verifyCaptchaMock: vi.fn(async (..._args: unknown[]) => ({
    valid: true,
    error: undefined as string | undefined,
  })),
}));
vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: applyRateLimitMock,
  applyActorRateLimit: () => false,
  refundRateLimit: () => {},
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/utils/captcha', () => ({ verifyCaptcha: verifyCaptchaMock }));

import { resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  definePublicRoute,
  publicMethod,
} from '../../utils/player/definePublicRoute';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    url: '/api/public-test',
    headers: { host: 'h' },
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
  res.end = () => res;
  return res;
}

const handler = vi.fn(async ({ ctx, body }: any) => ({
  tenantId: ctx.tenantId,
  body,
}));

const route = definePublicRoute({
  key: 'public-test',
  rateLimits: [
    { max: 3, windowMs: 1000, key: 'burst' },
    { max: 5, windowMs: 2000, key: 'hourly' },
  ],
  antiBot: true,
  POST: publicMethod({
    body: z.object({ name: z.string({ error: 'Nom ?' }) }),
    status: 201,
    handler,
  }),
});

beforeEach(() => {
  resetSupabaseMock();
  handler.mockClear();
  applyRateLimitMock.mockClear();
  verifyCaptchaMock.mockClear();
});

describe('definePublicRoute', () => {
  it('expose ses métadonnées (anti-bot, pas d’idempotence)', () => {
    expect(route.publicRoute.antiBot).toBe(true);
    expect(route.publicRoute.methods.POST?.idempotent).toBe(false);
  });

  it('405 + Allow sur une méthode non déclarée', async () => {
    const res = makeRes();
    await route(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('applique les plafonds dans l’ordre, sur leurs buckets historiques', async () => {
    applyRateLimitMock.mockImplementationOnce(() => false);
    applyRateLimitMock.mockImplementationOnce((_req: any, res: any) => {
      res.status(429).json({ error: 'Trop de requêtes.' });
      return true;
    });
    const res = makeRes();
    await route(makeReq({ body: { honeypot: 'bot' } }), res);
    expect(res.statusCode).toBe(429);
    expect(applyRateLimitMock.mock.calls.map((c) => c[3])).toEqual([
      'burst',
      'hourly',
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('honeypot rempli : 400 HONEYPOT, captcha jamais vérifié', async () => {
    const res = makeRes();
    await route(makeReq({ body: { name: 'A', honeypot: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('HONEYPOT');
    expect(verifyCaptchaMock).not.toHaveBeenCalled();
  });

  it('captcha faux : 400 CAPTCHA_INVALID avant zod et handler', async () => {
    verifyCaptchaMock.mockResolvedValueOnce({ valid: false, error: 'Non.' });
    const res = makeRes();
    await route(
      makeReq({ body: { captchaToken: 't', captchaAnswer: 7 } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'Non.', code: 'CAPTCHA_INVALID' });
    expect(verifyCaptchaMock).toHaveBeenCalledWith('t', '7');
    expect(handler).not.toHaveBeenCalled();
  });

  it('captcha bon : zod puis handler, avec le tenant public', async () => {
    const bad = makeRes();
    await route(makeReq({ body: {} }), bad);
    expect(bad.statusCode).toBe(400);
    expect(bad.body).toMatchObject({ error: 'Nom ?', code: 'validation' });

    const ok = makeRes();
    await route(makeReq({ body: { name: 'Nova' } }), ok);
    expect(ok.statusCode).toBe(201);
    expect(ok.body.body).toEqual({ name: 'Nova' });
    expect(typeof ok.body.tenantId).toBe('string');
  });
});
