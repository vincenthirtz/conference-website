// tests/unit/botPlanGate.test.ts
//
// Gate PLAN « Régie solidaire » branché sur l'API bot (Phase 0b → active).
//
// Deux niveaux de couverture :
//   1. Fonctions pures (utils/billing/botPlanGate.ts) : checkBotPlanCapability
//      + loadTenantPlanStateForBot (fail-closed discovery).
//   2. Intégration withBotRoute : baseline `discordBot` (le bot = foundation +
//      plans payants) sur TOUTE route tenant-scopée → discovery est refusé en 403
//      même sur une route basic ; foundation/regie passent ; un regie expiré
//      retombe sur discovery → 403. Les routes premium (requireCapability) sont
//      gatées en plus (mais le baseline fire avant pour un tenant sans bot).
//
// Le mock Supabase in-memory est réutilisé (pattern des tests bot existants) :
// on seede une row `tenants` avec les colonnes plan + une row `tenant_secrets`
// via seedBotAuth pour l'auth par clé.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetSupabaseMock,
  seedBotAuth,
  store,
  type Store,
} from './__helpers__/supabaseMock';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin };
});
vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin };
});

import { withBotRoute } from '../../utils/botAuth';
import {
  checkBotPlanCapability,
  loadTenantPlanStateForBot,
  __resetBotPlanCacheForTests,
  BOT_FALLBACK_PLAN_STATE,
} from '../../utils/billing/botPlanGate';
import type {
  TenantPlan,
  PlanStatus,
  TenantPlanState,
} from '../../utils/billing/planFeatures';
import { logger } from '../../utils/logger';

const NOW = Date.UTC(2026, 6, 1);
const HOUR = 3600_000;

/* ---------------------------------------------------------------------------
 * Fixtures : tenants avec plan + clé bot
 * ------------------------------------------------------------------------- */

const FOUNDATION = 'f0000000-0000-4000-8000-000000000001';
const DISCOVERY = 'd0000000-0000-4000-8000-000000000002';
const REGIE = 'e0000000-0000-4000-8000-000000000003';
const REGIE_EXPIRED = 'a0000000-0000-4000-8000-000000000004';

const KEY_FOUNDATION = 'key-foundation';
const KEY_DISCOVERY = 'key-discovery';
const KEY_REGIE = 'key-regie';
const KEY_REGIE_EXPIRED = 'key-regie-expired';

function seedTenantWithPlan(opts: {
  tenantId: string;
  apiKey: string;
  plan: TenantPlan;
  plan_status?: PlanStatus;
  plan_expires_at?: string | null;
  s?: Store;
}) {
  const s = opts.s ?? store;
  (s.tenants ||= []).push({
    id: opts.tenantId,
    plan: opts.plan,
    plan_status: opts.plan_status ?? 'active',
    plan_expires_at: opts.plan_expires_at ?? null,
  });
  // seedBotAuth ne dupliquera pas la row tenants (existence par id) mais
  // ajoutera la row tenant_secrets nécessaire à l'auth par clé.
  seedBotAuth({ tenantId: opts.tenantId, apiKey: opts.apiKey, store: s });
}

function makeReq(apiKey: string, method = 'GET', over: Partial<any> = {}): any {
  return {
    method,
    headers: { host: 'h', 'x-api-key': apiKey },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  __resetBotPlanCacheForTests();
  seedTenantWithPlan({
    tenantId: FOUNDATION,
    apiKey: KEY_FOUNDATION,
    plan: 'foundation',
  });
  seedTenantWithPlan({
    tenantId: DISCOVERY,
    apiKey: KEY_DISCOVERY,
    plan: 'discovery',
  });
  seedTenantWithPlan({ tenantId: REGIE, apiKey: KEY_REGIE, plan: 'regie' });
  seedTenantWithPlan({
    tenantId: REGIE_EXPIRED,
    apiKey: KEY_REGIE_EXPIRED,
    plan: 'regie',
    plan_status: 'active',
    // T10 : sept jours de grâce suivent l'échéance. « Expiré » veut donc dire
    // au-delà de cette fenêtre — une heure après l'échéance, le plan tient
    // encore, et c'est voulu.
    plan_expires_at: new Date(NOW - 10 * 24 * HOUR).toISOString(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------------------
 * checkBotPlanCapability — fonction pure
 * ------------------------------------------------------------------------- */

const foundationState: TenantPlanState = {
  plan: 'foundation',
  plan_status: 'active',
  plan_expires_at: null,
};
const discoveryState: TenantPlanState = {
  plan: 'discovery',
  plan_status: 'active',
  plan_expires_at: null,
};
const regieState: TenantPlanState = {
  plan: 'regie',
  plan_status: 'active',
  plan_expires_at: null,
};
const regieExpiredState: TenantPlanState = {
  plan: 'regie',
  plan_status: 'active',
  // T10 : sept jours de grâce suivent l'échéance. « Expiré » veut donc dire
    // au-delà de cette fenêtre — une heure après l'échéance, le plan tient
    // encore, et c'est voulu.
    plan_expires_at: new Date(NOW - 10 * 24 * HOUR).toISOString(),
};

describe('checkBotPlanCapability()', () => {
  it('foundation satisfait toutes les capacités (null)', () => {
    for (const cap of [
      'discordBot',
      'discordEventOps:full',
      'arbitration',
      'ratings',
    ] as const) {
      expect(checkBotPlanCapability(foundationState, cap, NOW)).toBeNull();
    }
  });

  it('discovery est refusé sur le baseline discordBot (plus de bot du tout)', () => {
    expect(
      checkBotPlanCapability(discoveryState, 'discordBot', NOW)
    ).toMatchObject({
      error: 'plan_required',
      requiredCapability: 'discordBot',
    });
    // regie actif a le bot ; regie expiré retombe sur discovery → refusé.
    expect(checkBotPlanCapability(regieState, 'discordBot', NOW)).toBeNull();
    expect(
      checkBotPlanCapability(regieExpiredState, 'discordBot', NOW)
    ).toMatchObject({ error: 'plan_required' });
  });

  it('discovery est refusé sur toutes les capacités premium (403 shape)', () => {
    const denial = checkBotPlanCapability(
      discoveryState,
      'discordEventOps:full',
      NOW
    );
    expect(denial).not.toBeNull();
    expect(denial).toMatchObject({
      error: 'plan_required',
      requiredCapability: 'discordEventOps:full',
    });
    expect(typeof denial?.message).toBe('string');
    expect(
      checkBotPlanCapability(discoveryState, 'arbitration', NOW)
    ).toMatchObject({ requiredCapability: 'arbitration' });
    expect(
      checkBotPlanCapability(discoveryState, 'ratings', NOW)
    ).toMatchObject({ requiredCapability: 'ratings' });
  });

  it('regie actif satisfait full-event-ops, arbitration et ratings', () => {
    expect(
      checkBotPlanCapability(regieState, 'discordEventOps:full', NOW)
    ).toBeNull();
    expect(checkBotPlanCapability(regieState, 'arbitration', NOW)).toBeNull();
    expect(checkBotPlanCapability(regieState, 'ratings', NOW)).toBeNull();
  });

  it('regie expiré retombe sur discovery → refusé sur premium', () => {
    expect(
      checkBotPlanCapability(regieExpiredState, 'discordEventOps:full', NOW)
    ).toMatchObject({ error: 'plan_required' });
    expect(
      checkBotPlanCapability(regieExpiredState, 'arbitration', NOW)
    ).toMatchObject({ error: 'plan_required' });
  });
});

/* ---------------------------------------------------------------------------
 * loadTenantPlanStateForBot — fail-closed
 * ------------------------------------------------------------------------- */

describe('loadTenantPlanStateForBot()', () => {
  it('charge le plan depuis la row tenants', async () => {
    const st = await loadTenantPlanStateForBot(REGIE);
    expect(st.plan).toBe('regie');
    expect(st.plan_status).toBe('active');
  });

  it('fail-closed discovery quand la row tenants est absente', async () => {
    const st = await loadTenantPlanStateForBot(
      '00000000-0000-4000-8000-000000000000'
    );
    expect(st).toEqual(BOT_FALLBACK_PLAN_STATE);
    expect(st.plan).toBe('discovery');
  });
});

/* ---------------------------------------------------------------------------
 * withBotRoute — gate intégré
 * ------------------------------------------------------------------------- */

const EVENT_OPS_OPTS = {
  methods: ['GET'] as const,
  rateLimit: { max: 100, key: 'plan-gate-eventops-test' },
  requireCapability: 'discordEventOps:full' as const,
};
const ARBITRATION_OPTS = {
  methods: ['GET'] as const,
  rateLimit: { max: 100, key: 'plan-gate-arbitration-test' },
  requireCapability: 'arbitration' as const,
};
const BASIC_OPTS = {
  methods: ['GET'] as const,
  rateLimit: { max: 100, key: 'plan-gate-basic-test' },
};

function eventOpsHandler() {
  let seenPlan: TenantPlanState | undefined;
  const handler = withBotRoute((req, res) => {
    seenPlan = req.botContext?.plan;
    res.status(200).json({ ok: true });
  }, EVENT_OPS_OPTS);
  return { handler, getSeenPlan: () => seenPlan };
}

describe('withBotRoute → gate PLAN premium (discordEventOps:full)', () => {
  it('foundation → 200 + plan attaché à req.botContext.plan', async () => {
    const { handler, getSeenPlan } = eventOpsHandler();
    const res = makeRes();
    await handler(makeReq(KEY_FOUNDATION), res);
    expect(res.statusCode).toBe(200);
    expect(getSeenPlan()?.plan).toBe('foundation');
  });

  it('regie actif → 200 (full event ops)', async () => {
    const { handler } = eventOpsHandler();
    const res = makeRes();
    await handler(makeReq(KEY_REGIE), res);
    expect(res.statusCode).toBe(200);
  });

  it('discovery → 403 (baseline discordBot fire AVANT le premium)', async () => {
    // discovery n'a pas le bot du tout : le gate baseline `discordBot` refuse
    // avant même d'évaluer `requireCapability` premium → requiredCapability =
    // 'discordBot' (message « le bot nécessite un plan »), pas 'discordEventOps:full'.
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, EVENT_OPS_OPTS);
    const res = makeRes();
    await handler(makeReq(KEY_DISCOVERY), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      error: 'plan_required',
      requiredCapability: 'discordBot',
    });
    expect(called).toBe(false);
  });

  it('regie expiré → downgrade discovery → 403', async () => {
    const { handler } = eventOpsHandler();
    const res = makeRes();
    await handler(makeReq(KEY_REGIE_EXPIRED), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'plan_required' });
  });
});

describe('withBotRoute → gate PLAN premium (arbitration)', () => {
  it('regie actif → 200 (arbitration)', async () => {
    const handler = withBotRoute((_req, res) => {
      res.status(200).json({ ok: true });
    }, ARBITRATION_OPTS);
    const res = makeRes();
    await handler(makeReq(KEY_REGIE), res);
    expect(res.statusCode).toBe(200);
  });

  it('discovery → 403 (baseline discordBot fire avant arbitration)', async () => {
    const handler = withBotRoute((_req, res) => {
      res.status(200).json({ ok: true });
    }, ARBITRATION_OPTS);
    const res = makeRes();
    await handler(makeReq(KEY_DISCOVERY), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      error: 'plan_required',
      requiredCapability: 'discordBot',
    });
  });
});

describe('withBotRoute → BASELINE discordBot (le bot = foundation + plans payants)', () => {
  it('discovery → 403 plan_required (discordBot) même sur une route SANS requireCapability', async () => {
    let called = false;
    const handler = withBotRoute((_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    }, BASIC_OPTS);
    const res = makeRes();
    await handler(makeReq(KEY_DISCOVERY), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      error: 'plan_required',
      requiredCapability: 'discordBot',
    });
    expect(called).toBe(false);
  });

  it('foundation → 200 sur une route basic + plan attaché', async () => {
    let seenPlan: TenantPlanState | undefined;
    const handler = withBotRoute((req, res) => {
      seenPlan = req.botContext?.plan;
      res.status(200).json({ ok: true });
    }, BASIC_OPTS);
    const res = makeRes();
    await handler(makeReq(KEY_FOUNDATION), res);
    expect(res.statusCode).toBe(200);
    expect(seenPlan?.plan).toBe('foundation');
  });

  it('regie actif → 200 sur une route basic (a le bot)', async () => {
    const handler = withBotRoute((_req, res) => {
      res.status(200).json({ ok: true });
    }, BASIC_OPTS);
    const res = makeRes();
    await handler(makeReq(KEY_REGIE), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('withBotRoute → crossTenant + requireCapability = ignoré (warn)', () => {
  it('ne 403 pas (aucun tenant à gater) et warn', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    let called = false;
    const handler = withBotRoute(
      (_req, res) => {
        called = true;
        res.status(200).json({ ok: true });
      },
      {
        methods: ['GET'] as const,
        rateLimit: { max: 100, key: 'plan-gate-cross-test' },
        crossTenant: true as const,
        // Déclaration incohérente volontaire pour le test.
        requireCapability: 'discordEventOps:full' as const,
      } as never
    );
    const res = makeRes();
    await handler(makeReq(KEY_DISCOVERY), res);
    expect(res.statusCode).toBe(200);
    expect(called).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});
