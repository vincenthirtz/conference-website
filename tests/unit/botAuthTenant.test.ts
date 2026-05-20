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
import {
  resetSupabaseMock,
  store,
} from './__helpers__/supabaseMock';
import {
  withBotRoute,
  __resetBotIdempotencyCache,
} from '../../utils/botAuth';
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

/* ---------------------------------------------------------------------------
 * withBotRoute() — idempotency cache is tenant-scoped
 *
 * Two tenants using the same Idempotency-Key on the same path must NOT
 * collide. We exercise this by sending the same POST twice (same key, same
 * body) from two different tenants and asserting:
 *   - both calls execute the handler (no replay cross-tenant)
 *   - both rows are persisted with the right tenant_id
 *   - a third call from tenant A *does* hit the cache (replay) — proves
 *     the cache is still active, just scoped.
 * ------------------------------------------------------------------------- */

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const POST_OPTS = {
  methods: ['POST'] as const,
  rateLimit: { max: 100, key: 'idempotency-tenant-test' },
  idempotent: true,
};

describe('withBotRoute → idempotency cache is tenant-scoped', () => {
  beforeEach(async () => {
    await __resetBotIdempotencyCache();
  });

  it('same Idempotency-Key on two tenants does NOT collide', async () => {
    let calls = 0;
    const handler = withBotRoute((_req, res) => {
      calls += 1;
      res.status(200).json({ calls });
    }, POST_OPTS);

    // Tenant A — first call
    const resA = makeRes();
    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': 'test-key',
            'x-tenant-id': TENANT_A,
            'idempotency-key': 'shared-key-123',
          },
          body: { payload: 'same' },
        },
        'POST'
      ),
      resA
    );
    expect(resA.statusCode).toBe(200);
    expect(resA.body).toEqual({ calls: 1 });
    expect(resA.headers['Idempotency-Replay']).toBeUndefined();

    // Tenant B — same key, same body, different tenant → executes (no replay).
    const resB = makeRes();
    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': 'test-key',
            'x-tenant-id': TENANT_B,
            'idempotency-key': 'shared-key-123',
          },
          body: { payload: 'same' },
        },
        'POST'
      ),
      resB
    );
    expect(resB.statusCode).toBe(200);
    // Handler ran again — counter is 2, not a replay of {calls: 1}.
    expect(resB.body).toEqual({ calls: 2 });
    expect(resB.headers['Idempotency-Replay']).toBeUndefined();
  });

  it('persists tenant_id alongside cache_key in bot_idempotency', async () => {
    const handler = withBotRoute((_req, res) => {
      res.status(201).json({ ok: true });
    }, POST_OPTS);

    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': 'test-key',
            'x-tenant-id': TENANT_A,
            'idempotency-key': 'persistence-key',
          },
          body: { foo: 'bar' },
        },
        'POST'
      ),
      makeRes()
    );

    const rows = (store['bot_idempotency'] ?? []) as Array<{
      tenant_id?: string;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });

  it('still replays for the same tenant + same key (cache works, scoped)', async () => {
    let calls = 0;
    const handler = withBotRoute((_req, res) => {
      calls += 1;
      res.status(200).json({ calls });
    }, POST_OPTS);

    // First call — executes.
    const res1 = makeRes();
    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': 'test-key',
            'x-tenant-id': TENANT_A,
            'idempotency-key': 'replay-key',
          },
          body: { same: 'body' },
        },
        'POST'
      ),
      res1
    );
    expect(res1.body).toEqual({ calls: 1 });

    // Second call — same tenant, same key, same body → replay (no handler run).
    const res2 = makeRes();
    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': 'test-key',
            'x-tenant-id': TENANT_A,
            'idempotency-key': 'replay-key',
          },
          body: { same: 'body' },
        },
        'POST'
      ),
      res2
    );
    // Cache hit → body is the previous response, handler didn't increment.
    expect(res2.body).toEqual({ calls: 1 });
    expect(res2.headers['Idempotency-Replay']).toBe('true');
    expect(calls).toBe(1);
  });
});
