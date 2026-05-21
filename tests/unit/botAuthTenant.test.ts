// tests/unit/botAuthTenant.test.ts
//
// Multi-tenant plumbing — Phase 1 / S2 → V2 (durci).
//
// Couvre la resolution tenant cablee dans `withBotRoute` (utils/botAuth.ts)
// + le helper standalone `resolveTenantId` (utils/tenant.ts).
//
// V2 (active maintenant) : le header `x-tenant-id` est REQUIS pour toutes
// les routes bot non-flagguees `crossTenant: true`. Le helper
// `resolveTenantId` lui-meme garde son comportement fail-open historique
// (il est juste plus appele directement depuis le middleware — la logique
// stricte est inline dans `withBotRoute`).
//
// On exerce le middleware end-to-end avec un handler captureur pour verifier
// que `req.botContext.tenantId` est bien pose ou que les codes d'erreur
// adequats (MISSING_TENANT_ID / INVALID_TENANT_ID / UNKNOWN_TENANT) sortent
// selon le cas.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetSupabaseMock,
  store,
} from './__helpers__/supabaseMock';
import {
  withBotRoute,
  __resetBotIdempotencyCache,
  __resetTenantExistsCache,
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
  __resetTenantExistsCache();
  process.env.BOT_API_KEY = 'test-key';
  delete process.env.DEFAULT_TENANT_ID;
  // Seed le tenant cible commun pour les tests qui passent par l'existence
  // check (l'enforcement durci interroge `tenants` quand on est en fallback
  // env legacy). Le test "header valide mais tenant inexistant" override.
  store.tenants = [{ id: VALID_TENANT_HEADER }];
});

afterEach(() => {
  delete process.env.BOT_API_KEY;
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------------------
 * resolveTenantId() — unit-level (helper, encore fail-open par design)
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
 * withBotRoute() — V2 strict tenant enforcement
 *
 * Quand on est en fallback env legacy (pas de match `tenant_secrets`), le
 * middleware exige maintenant le header. Le helper `resolveTenantId` n'est
 * plus appele directement — la logique stricte est inline.
 * ------------------------------------------------------------------------- */

describe('withBotRoute → tenant header strict enforcement (V2)', () => {
  it('attaches the header UUID after auth passes (tenant existe en DB)', async () => {
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

  it('400 MISSING_TENANT_ID quand le header est absent', async () => {
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('MISSING_TENANT_ID');
    expect(called).toBe(false);
  });

  it('400 INVALID_TENANT_ID quand le header est malforme', async () => {
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(
      makeReq({
        headers: {
          host: 'h',
          'x-api-key': 'test-key',
          'x-tenant-id': 'not-a-uuid',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TENANT_ID');
    expect(called).toBe(false);
  });

  it('404 UNKNOWN_TENANT quand le header est valide mais le tenant absent en DB', async () => {
    // On supprime la row seed dans le beforeEach.
    store.tenants = [];

    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
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

    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('UNKNOWN_TENANT');
    expect(called).toBe(false);
  });

  it('400 MISSING_TENANT_ID quand le header est explicitement vide', async () => {
    const handler = withBotRoute((_req, res) => {
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(
      makeReq({
        headers: {
          host: 'h',
          'x-api-key': 'test-key',
          'x-tenant-id': '',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('MISSING_TENANT_ID');
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
 * withBotRoute() — crossTenant: true bypasse la validation tenant
 * ------------------------------------------------------------------------- */

describe('withBotRoute → crossTenant: true', () => {
  const CROSS_OPTS = {
    methods: ['GET'] as const,
    rateLimit: { max: 100, key: 'cross-tenant-test' },
    crossTenant: true,
  };

  it('handler est appele sans erreur quand le header est absent', async () => {
    let called = false;
    let seenTenantId: string | undefined;
    const handler = withBotRoute((req, res) => {
      called = true;
      seenTenantId = req.botContext?.tenantId;
      res.status(200).json({ ok: true });
    }, CROSS_OPTS);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(called).toBe(true);
    // crossTenant : req.botContext n'est pas pose, le handler ne doit pas lire.
    expect(seenTenantId).toBeUndefined();
  });

  it('handler est appele meme avec un header malforme (ignore)', async () => {
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, CROSS_OPTS);

    const res = makeRes();
    await handler(
      makeReq({
        headers: {
          host: 'h',
          'x-api-key': 'test-key',
          'x-tenant-id': 'pas-un-uuid',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(called).toBe(true);
  });

  it('handler est appele sans round-trip DB tenant', async () => {
    // Aucune row dans `tenants` → un endpoint scope plante en 404 ; un
    // crossTenant doit reussir.
    store.tenants = [];

    const handler = withBotRoute((_req, res) => {
      res.status(200).json({ ok: true });
    }, CROSS_OPTS);

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
  });
});

/* ---------------------------------------------------------------------------
 * withBotRoute() — per-tenant API key match (clé autoritaire)
 *
 * Quand la cle x-api-key matche une row tenant_secrets.bot_api_key_hash, le
 * tenantId vient de la DB et le header x-tenant-id est ignore (warn si
 * conflict).
 * ------------------------------------------------------------------------- */

const PER_TENANT_KEY = 'per-tenant-key-xyz';
const KEY_TENANT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('withBotRoute → per-tenant API key match', () => {
  beforeEach(() => {
    // Seed un mapping key->tenant. sha256 du provided key sera resolu dans
    // verifyBotApiKeyMultiTenant via .eq('bot_api_key_hash', hash).
    const crypto = require('crypto');
    const hash = crypto
      .createHash('sha256')
      .update(PER_TENANT_KEY)
      .digest('hex');
    store.tenant_secrets = [
      { tenant_id: KEY_TENANT_ID, bot_api_key_hash: hash },
    ];
    store.tenants = [{ id: KEY_TENANT_ID }];
  });

  it('tenantId vient de la DB, header ignore quand conflit', async () => {
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
          'x-api-key': PER_TENANT_KEY,
          // Header contradictoire — doit etre ignore au profit de la key.
          'x-tenant-id': VALID_TENANT_HEADER,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(KEY_TENANT_ID);
    // Warn emit pour signaler le mismatch.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/conflicts with per-tenant/i);
  });

  it('tenantId vient de la DB meme sans header — pas d\'erreur', async () => {
    let seenTenantId: string | undefined;
    const handler = withBotRoute((req, res) => {
      seenTenantId = req.botContext?.tenantId;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(
      makeReq({
        headers: { host: 'h', 'x-api-key': PER_TENANT_KEY },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(KEY_TENANT_ID);
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
    // Seed les deux tenants — sinon la validation V2 rejette en 404.
    store.tenants = [{ id: TENANT_A }, { id: TENANT_B }];
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
