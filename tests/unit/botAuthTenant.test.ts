// tests/unit/botAuthTenant.test.ts
//
// Multi-tenant plumbing — Phase 1 / S2.
//
// Covers the tenant resolution wired into `withBotRoute` (utils/botAuth.ts)
// and the standalone helper `resolveTenantId` (utils/tenant.ts).
//
// We exercise the middleware end-to-end with a captured handler so we know
// that `req.botContext.tenantId` is populated by the time the route runs.
// GET is used to skip the maintenance check (only non-safe methods hit it).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetSupabaseMock } from './__helpers__/supabaseMock';
import { withBotRoute } from '../../utils/botAuth';
import { DEFAULT_TENANT_ID, resolveTenantId } from '../../utils/tenant';
import { logger } from '../../utils/logger';

const VALID_TENANT_HEADER = '11111111-2222-4333-8444-555555555555';

function makeReq(over: Partial<any> = {}, method = 'GET'): any {
  return {
    method,
    headers: { host: 'h', 'x-api-key': 'test-key' },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const RL_OPTS = {
  methods: ['GET'] as const,
  rateLimit: { max: 100, key: 'tenant-test' },
};

beforeEach(() => {
  resetSupabaseMock();
  process.env.BOT_API_KEY = 'test-key';
  delete process.env.DEFAULT_TENANT_ID;
});

afterEach(() => {
  delete process.env.BOT_API_KEY;
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------------------
 * resolveTenantId() — unit-level
 * ------------------------------------------------------------------------- */

describe('resolveTenantId()', () => {
  it('returns the header UUID when valid (lower-cased)', () => {
    const upper = '11111111-2222-4333-8444-555555555555'.toUpperCase();
    const req = makeReq({ headers: { 'x-tenant-id': upper } });
    expect(resolveTenantId(req)).toBe(upper.toLowerCase());
  });

  it('falls back to DEFAULT_TENANT_ID when header is missing (no warn)', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const req = makeReq();
    expect(resolveTenantId(req)).toBe(DEFAULT_TENANT_ID);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back + warns when header is malformed', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const req = makeReq({ headers: { 'x-tenant-id': 'not-a-uuid' } });
    expect(resolveTenantId(req)).toBe(DEFAULT_TENANT_ID);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/not a valid UUID/i);
  });

  it('falls back when header is the empty string (no warn — same as absent)', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const req = makeReq({ headers: { 'x-tenant-id': '' } });
    expect(resolveTenantId(req)).toBe(DEFAULT_TENANT_ID);
    expect(warn).not.toHaveBeenCalled();
  });

  it('handles header passed as array (Node lower-case header normalisation)', () => {
    const req = makeReq({
      headers: { 'x-tenant-id': [VALID_TENANT_HEADER, 'ignored'] as any },
    });
    expect(resolveTenantId(req)).toBe(VALID_TENANT_HEADER);
  });

  it('DEFAULT_TENANT_ID is the hardcoded conference tenant when env unset', () => {
    // We can't easily re-evaluate the module's top-level const here without
    // dynamic import, but we can assert the *current* value matches the
    // documented conference UUID (env was deleted in beforeEach).
    expect(DEFAULT_TENANT_ID).toBe('ce69a726-773e-4d12-b5eb-d2503aa752b4');
  });
});

/* ---------------------------------------------------------------------------
 * withBotRoute() — middleware attaches req.botContext.tenantId
 * ------------------------------------------------------------------------- */

describe('withBotRoute → req.botContext.tenantId', () => {
  it('attaches the header UUID after auth passes', async () => {
    let seenTenantId: string | undefined;
    const handler = withBotRoute((req, res) => {
      seenTenantId = req.botContext?.tenantId;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(
      makeReq({
        headers: {
          host: 'h',
          'x-api-key': 'test-key',
          'x-tenant-id': VALID_TENANT_HEADER,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(VALID_TENANT_HEADER);
  });

  it('attaches DEFAULT_TENANT_ID when header is absent', async () => {
    let seenTenantId: string | undefined;
    const handler = withBotRoute((req, res) => {
      seenTenantId = req.botContext?.tenantId;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(DEFAULT_TENANT_ID);
  });

  it('attaches DEFAULT_TENANT_ID + logs a warning when header is malformed', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    let seenTenantId: string | undefined;
    const handler = withBotRoute((req, res) => {
      seenTenantId = req.botContext?.tenantId;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(
      makeReq({
        headers: {
          host: 'h',
          'x-api-key': 'test-key',
          'x-tenant-id': 'bogus-value',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(DEFAULT_TENANT_ID);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does NOT attach context when API key is missing (still 401)', async () => {
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(
      makeReq({ headers: { host: 'h', 'x-tenant-id': VALID_TENANT_HEADER } }),
      res
    );

    expect(res.statusCode).toBe(401);
    expect(called).toBe(false);
  });
});
