// tests/unit/botAuthTenant.test.ts
//
// Bot auth multi-tenant — contrat V3 (100% per-tenant).
//
// Le fallback env legacy (`BOT_API_KEY`) et la table de cache d'existence
// tenant ont été RETIRÉS. L'auth bot est maintenant entièrement portée par la
// clé : `verifyBotApiKeyMultiTenant` calcule sha256(x-api-key) et cherche une
// row `tenant_secrets.bot_api_key_hash`. La row qui matche fournit le
// `tenantId` autoritaire. Le header `x-tenant-id` n'est plus requis ni validé
// (il est purement informatif — la clé l'emporte ; un conflit déclenche un
// simple warn).
//
// On exerce `withBotRoute` end-to-end avec un handler captureur pour vérifier :
//   - clé valide seedée → 200 + `req.botContext.tenantId` == tenant de la clé,
//   - clé inconnue/absente → 401 { error } (plus de 500, plus de codes tenant),
//   - `x-tenant-id` ignoré (absent / différent → toujours résolu par la clé),
//   - deux clés distinctes mappent vers deux tenants distincts,
//   - `resolveTenantId` (helper standalone, encore fail-open par design),
//   - crossTenant: true bypasse la résolution mais exige TOUJOURS une clé valide,
//   - le cache d'idempotency reste scopé par tenant.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetSupabaseMock,
  seedBotAuth,
  hashBotApiKey,
  CONFERENCE_TENANT_ID,
  BOT_TEST_API_KEY,
  store,
} from './__helpers__/supabaseMock';
import { withBotRoute, __resetBotIdempotencyCache } from '../../utils/botAuth';
import { DEFAULT_TENANT_ID, resolveTenantId } from '../../utils/tenant';
import { logger } from '../../utils/logger';

const VALID_TENANT_HEADER = '11111111-2222-4333-8444-555555555555';

function makeReq(over: Partial<any> = {}, method = 'GET'): any {
  return {
    method,
    headers: { host: 'h', 'x-api-key': BOT_TEST_API_KEY },
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
  delete process.env.DEFAULT_TENANT_ID;
  // Seed la clé de test → tenant conference (idiome historique préservé).
  seedBotAuth();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------------------
 * resolveTenantId() — unit-level (helper, encore fail-open par design)
 * ------------------------------------------------------------------------- */

describe('resolveTenantId()', () => {
  it('returns the header UUID when valid (lower-cased)', () => {
    const upper = VALID_TENANT_HEADER.toUpperCase();
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
    expect(DEFAULT_TENANT_ID).toBe(CONFERENCE_TENANT_ID);
  });
});

/* ---------------------------------------------------------------------------
 * withBotRoute() — V3 per-tenant-only auth (la clé est autoritaire)
 * ------------------------------------------------------------------------- */

describe('withBotRoute → per-tenant key is authoritative', () => {
  it('200 + attache le tenant de la clé (header absent)', async () => {
    let seenTenantId: string | undefined;
    const handler = withBotRoute((req, res) => {
      seenTenantId = req.botContext?.tenantId;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(CONFERENCE_TENANT_ID);
  });

  it('401 quand la clé est inconnue (pas de row tenant_secrets)', async () => {
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(
      makeReq({
        headers: { host: 'h', 'x-api-key': 'totally-unknown-key' },
      }),
      res
    );

    expect(res.statusCode).toBe(401);
    expect((res.body as any).error).toBeDefined();
    // Plus aucun code tenant (MISSING/INVALID/UNKNOWN) ni 500.
    expect((res.body as any).code).toBeUndefined();
    expect(called).toBe(false);
  });

  it('401 quand le header x-api-key est absent', async () => {
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);

    expect(res.statusCode).toBe(401);
    expect((res.body as any).error).toBeDefined();
    expect(called).toBe(false);
  });

  it('x-tenant-id différent est IGNORÉ — la clé gagne (200, warn)', async () => {
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
          'x-api-key': BOT_TEST_API_KEY,
          // Header contradictoire — doit être ignoré au profit de la clé.
          'x-tenant-id': VALID_TENANT_HEADER,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(CONFERENCE_TENANT_ID);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/conflicts with per-tenant/i);
  });

  it('x-tenant-id malformé est ignoré sans erreur (la clé gagne)', async () => {
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
          'x-api-key': BOT_TEST_API_KEY,
          'x-tenant-id': 'not-a-uuid',
        },
      }),
      res
    );

    // Plus de 400 INVALID_TENANT_ID — le header n'est plus validé.
    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(CONFERENCE_TENANT_ID);
  });

  it('deux clés distinctes résolvent vers deux tenants distincts', async () => {
    const KEY_B = 'second-tenant-key';
    const TENANT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    seedBotAuth({ tenantId: TENANT_B, apiKey: KEY_B });

    let seen: string | undefined;
    const handler = withBotRoute((req, res) => {
      seen = req.botContext?.tenantId;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const resA = makeRes();
    await handler(
      makeReq({ headers: { host: 'h', 'x-api-key': BOT_TEST_API_KEY } }),
      resA
    );
    expect(resA.statusCode).toBe(200);
    expect(seen).toBe(CONFERENCE_TENANT_ID);

    const resB = makeRes();
    await handler(
      makeReq({ headers: { host: 'h', 'x-api-key': KEY_B } }),
      resB
    );
    expect(resB.statusCode).toBe(200);
    expect(seen).toBe(TENANT_B);
  });

  it('la résolution est insensible à la présence de la row tenants (clé seule suffit)', async () => {
    // L'ancien round-trip d'existence a disparu : on vide `tenants`, l'auth
    // reste portée par tenant_secrets uniquement.
    store.tenants = [];

    let seenTenantId: string | undefined;
    const handler = withBotRoute((req, res) => {
      seenTenantId = req.botContext?.tenantId;
      res.status(200).json({ ok: true });
    }, RL_OPTS);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(seenTenantId).toBe(CONFERENCE_TENANT_ID);
  });
});

/* ---------------------------------------------------------------------------
 * withBotRoute() — crossTenant: true bypasse la résolution tenant
 * mais exige TOUJOURS une clé valide.
 * ------------------------------------------------------------------------- */

describe('withBotRoute → crossTenant: true', () => {
  const CROSS_OPTS = {
    methods: ['GET'] as const,
    rateLimit: { max: 100, key: 'cross-tenant-test' },
    // `as const` : sans ça TS élargit `true` → `boolean`, qui ne matche aucun
    // des overloads de withBotRoute ({ crossTenant?: false } | { crossTenant: true }).
    crossTenant: true as const,
  };

  it('200 + botContext non posé quand la clé est valide', async () => {
    let called = false;
    let seenTenantId: string | undefined;
    const handler = withBotRoute((req, res) => {
      called = true;
      // Cast : BotCrossTenantRequest interdit la lecture de tenantId au type
      // (c'est le but) ; ici on vérifie l'absence au RUNTIME via un cast.
      seenTenantId = (req as { botContext?: { tenantId?: string } }).botContext
        ?.tenantId;
      res.status(200).json({ ok: true });
    }, CROSS_OPTS);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(called).toBe(true);
    // crossTenant : req.botContext.tenantId reste undefined par contrat.
    expect(seenTenantId).toBeUndefined();
  });

  it('401 quand la clé est invalide même en crossTenant', async () => {
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, CROSS_OPTS);

    const res = makeRes();
    await handler(
      makeReq({ headers: { host: 'h', 'x-api-key': 'bad-key' } }),
      res
    );

    expect(res.statusCode).toBe(401);
    expect(called).toBe(false);
  });

  it("header x-tenant-id malformé ignoré (pas d'erreur)", async () => {
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
          'x-api-key': BOT_TEST_API_KEY,
          'x-tenant-id': 'pas-un-uuid',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(called).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * withBotRoute() — idempotency cache is tenant-scoped
 *
 * Deux tenants utilisant la même Idempotency-Key sur le même path ne doivent
 * PAS entrer en collision. Chaque tenant a sa propre clé seedée.
 * ------------------------------------------------------------------------- */

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY_A = 'idem-key-a';
const KEY_B = 'idem-key-b';

const POST_OPTS = {
  methods: ['POST'] as const,
  rateLimit: { max: 100, key: 'idempotency-tenant-test' },
  idempotent: true,
};

describe('withBotRoute → idempotency cache is tenant-scoped', () => {
  beforeEach(async () => {
    await __resetBotIdempotencyCache();
    // Deux tenants, chacun avec sa propre clé bot.
    seedBotAuth({ tenantId: TENANT_A, apiKey: KEY_A });
    seedBotAuth({ tenantId: TENANT_B, apiKey: KEY_B });
  });

  it('same Idempotency-Key on two tenants does NOT collide', async () => {
    let calls = 0;
    const handler = withBotRoute((_req, res) => {
      calls += 1;
      res.status(200).json({ calls });
    }, POST_OPTS);

    const resA = makeRes();
    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': KEY_A,
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

    const resB = makeRes();
    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': KEY_B,
            'idempotency-key': 'shared-key-123',
          },
          body: { payload: 'same' },
        },
        'POST'
      ),
      resB
    );
    expect(resB.statusCode).toBe(200);
    // Handler ran again — tenant B n'a pas rejoué la réponse de A.
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
            'x-api-key': KEY_A,
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

    const res1 = makeRes();
    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': KEY_A,
            'idempotency-key': 'replay-key',
          },
          body: { same: 'body' },
        },
        'POST'
      ),
      res1
    );
    expect(res1.body).toEqual({ calls: 1 });

    const res2 = makeRes();
    await handler(
      makeReq(
        {
          headers: {
            host: 'h',
            'x-api-key': KEY_A,
            'idempotency-key': 'replay-key',
          },
          body: { same: 'body' },
        },
        'POST'
      ),
      res2
    );
    expect(res2.body).toEqual({ calls: 1 });
    expect(res2.headers['Idempotency-Replay']).toBe('true');
    expect(calls).toBe(1);
  });
});

// Garde un usage explicite de hashBotApiKey pour documenter le mapping
// clé→hash (sinon l'import serait inutilisé). C'est le même calcul que
// verifyBotApiKeyMultiTenant côté production.
describe('hashBotApiKey (documentation)', () => {
  it('matches the seeded tenant_secrets row hash', () => {
    seedBotAuth();
    const expected = hashBotApiKey(BOT_TEST_API_KEY);
    const row = (store.tenant_secrets ?? []).find(
      (r) => r.bot_api_key_hash === expected
    );
    expect(row).toBeDefined();
    expect(row?.tenant_id).toBe(CONFERENCE_TENANT_ID);
  });
});
