// tests/unit/prizePoolFunding.test.ts
//
// « Profondeur de la monétisation » — cash-prize crowdfundé.
//
// Couvre :
//  - resolvePrizeCorrelation (metadata primaire, fallback checkouts, don non-prize)
//  - applyPrizeContribution (application, idempotence, montant invalide, cagnotte inconnue)
//  - le webhook de bout en bout (route un paiement prize sans casser la branche
//    tenant-plan ni le don générique)
//  - POST /api/helloasso/prize-checkout (cagnotte ouverte OK, fermée / introuvable rejetées)
//  - GET public /api/tournaments/[id]/prize-pool (masque email, anonymise)
//  - GET/PUT admin /api/admin/tournaments/[id]/prize-pool (manager OK, caster 403)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock supabase (in-memory) — partagé par les utils, le webhook et les endpoints.
vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

// createCheckoutIntent mocké (pas d'appel réseau HelloAsso), reste du module réel.
const createCheckoutIntent = vi.hoisted(() =>
  vi.fn<(...args: any[]) => any>(async () => ({
    id: 424242,
    redirectUrl: 'https://helloasso.test/redirect/prize',
  }))
);
vi.mock('@/utils/helloasso', async () => {
  const real =
    await vi.importActual<typeof import('../../utils/helloasso')>(
      '@/utils/helloasso'
    );
  return { ...real, createCheckoutIntent };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  resolvePrizeCorrelation,
  applyPrizeContribution,
  buildPrizeCheckoutMetadata,
  type PrizeCorrelation,
} from '../../utils/billing/prizePoolFunding';
import type { HelloAssoWebhookEvent } from '../../utils/helloasso';

import webhookHandler from '../../pages/api/helloasso/webhook';
import prizeCheckoutHandler from '../../pages/api/helloasso/prize-checkout';
import publicPrizePoolHandler from '../../pages/api/tournaments/[id]/prize-pool';
import adminPrizePoolHandler from '../../pages/api/admin/tournaments/[id]/prize-pool';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID
const TOURNAMENT = '22222222-2222-4222-8222-222222222222';
const POOL = '33333333-3333-4333-8333-333333333333';
const STAFF_1 = '55555555-5555-4555-8555-555555555555';
const NOW = Date.parse('2026-07-13T12:00:00Z');

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
  };
}

function seedPool(over: Record<string, unknown> = {}) {
  store.tournament_prize_pools = [
    {
      id: POOL,
      tournament_id: TOURNAMENT,
      tenant_id: TENANT,
      title: 'Cagnotte',
      currency: 'EUR',
      goal_amount_cents: 100000,
      base_amount_cents: 50000,
      raised_amount_cents: 0,
      is_open: true,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
      ...over,
    },
  ] as any;
}

function seedTournament() {
  store.tournaments = [
    { id: TOURNAMENT, tenant_id: TENANT, name: 'Coupe', is_public: true },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  createCheckoutIntent.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ===========================================================================
 * resolvePrizeCorrelation
 * =========================================================================*/

function paymentEvent(
  over: Partial<HelloAssoWebhookEvent['data']> = {},
  metadata?: Record<string, unknown>,
  rootMetadata?: Record<string, unknown>
): HelloAssoWebhookEvent {
  return {
    eventType: 'Payment',
    ...(rootMetadata ? { metadata: rootMetadata } : {}),
    data: {
      id: 111,
      amount: 5000,
      state: 'Authorized',
      ...(metadata ? { metadata } : {}),
      ...over,
    },
  };
}

describe('resolvePrizeCorrelation', () => {
  it('metadata (data.metadata) : canal primaire', async () => {
    const c = await resolvePrizeCorrelation(
      paymentEvent({}, buildPrizeCheckoutMetadata(POOL, TENANT))
    );
    expect(c).toMatchObject({
      prizePoolId: POOL,
      tenantId: TENANT,
      source: 'metadata',
    });
  });

  it("metadata à la racine (event.metadata) : fallback d'emplacement", async () => {
    const c = await resolvePrizeCorrelation(
      paymentEvent({}, undefined, buildPrizeCheckoutMetadata(POOL, TENANT))
    );
    expect(c).toMatchObject({ prizePoolId: POOL, source: 'metadata' });
  });

  it('enrichit nom / message / anonymat depuis la row checkout', async () => {
    store.prize_pool_checkouts = [
      {
        checkout_intent_id: '777',
        prize_pool_id: POOL,
        tenant_id: TENANT,
        contributor_name: 'Alice',
        is_anonymous: false,
        message: 'Go go go',
      },
    ] as any;
    const c = await resolvePrizeCorrelation(
      paymentEvent(
        { checkoutIntentId: 777 },
        buildPrizeCheckoutMetadata(POOL, TENANT)
      )
    );
    expect(c).toMatchObject({
      prizePoolId: POOL,
      contributorName: 'Alice',
      isAnonymous: false,
      message: 'Go go go',
      checkoutIntentId: '777',
    });
  });

  it('fallback mapping prize_pool_checkouts via checkout_intent_id', async () => {
    store.prize_pool_checkouts = [
      {
        checkout_intent_id: '555',
        prize_pool_id: POOL,
        tenant_id: TENANT,
        contributor_name: 'Bob',
        is_anonymous: true,
        message: null,
      },
    ] as any;
    const c = await resolvePrizeCorrelation(
      paymentEvent({ checkoutIntentId: 555 })
    );
    expect(c).toMatchObject({
      prizePoolId: POOL,
      tenantId: TENANT,
      source: 'checkout_mapping',
      isAnonymous: true,
      checkoutIntentId: '555',
    });
  });

  it('don non-prize (aucune metadata / aucun mapping) → null', async () => {
    const c = await resolvePrizeCorrelation(
      paymentEvent({ payer: { email: 'p@x.com' } })
    );
    expect(c).toBeNull();
  });

  it('metadata invalide (mauvais kind) → null', async () => {
    const c = await resolvePrizeCorrelation(
      paymentEvent(
        {},
        { kind: 'tenant_plan', prize_pool_id: POOL, tenant_id: TENANT }
      )
    );
    expect(c).toBeNull();
  });
});

/* ===========================================================================
 * applyPrizeContribution
 * =========================================================================*/

function correlation(over: Partial<PrizeCorrelation> = {}): PrizeCorrelation {
  return {
    prizePoolId: POOL,
    tenantId: TENANT,
    checkoutIntentId: '999',
    contributorName: 'Alice',
    isAnonymous: false,
    message: 'Bravo',
    source: 'metadata',
    ...over,
  };
}

describe('applyPrizeContribution', () => {
  it('applique une contribution → ledger + incrément raised_amount_cents', async () => {
    seedPool();
    store.prize_pool_checkouts = [
      {
        checkout_intent_id: '999',
        prize_pool_id: POOL,
        tenant_id: TENANT,
        status: 'pending',
      },
    ] as any;
    const r = await applyPrizeContribution(correlation(), 'pay-1', 2500, {
      nowMs: NOW,
    });
    expect(r.status).toBe('applied');
    expect((store.prize_pool_contributions ?? []).length).toBe(1);
    expect((store.tournament_prize_pools[0] as any).raised_amount_cents).toBe(
      2500
    );
    // Checkout promu en confirmed.
    expect((store.prize_pool_checkouts[0] as any).status).toBe('confirmed');
    // Snapshot contributeur sur la contribution.
    const contrib = store.prize_pool_contributions[0] as any;
    expect(contrib.contributor_name).toBe('Alice');
    expect(contrib.is_anonymous).toBe(false);
    expect(contrib.message).toBe('Bravo');
    expect(contrib.helloasso_payment_id).toBe('pay-1');
  });

  it('rejeu du même helloasso_payment_id → ONE contribution, incrément UNE fois', async () => {
    seedPool();
    const r1 = await applyPrizeContribution(correlation(), 'pay-2', 2500, {
      nowMs: NOW,
    });
    expect(r1.status).toBe('applied');
    const r2 = await applyPrizeContribution(correlation(), 'pay-2', 2500, {
      nowMs: NOW,
    });
    expect(r2.status).toBe('already_applied');
    expect((store.prize_pool_contributions ?? []).length).toBe(1);
    expect((store.tournament_prize_pools[0] as any).raised_amount_cents).toBe(
      2500
    );
  });

  it('deux paiements distincts → deux contributions, cumul', async () => {
    seedPool();
    await applyPrizeContribution(correlation(), 'pay-3', 2500, { nowMs: NOW });
    await applyPrizeContribution(correlation(), 'pay-4', 1500, { nowMs: NOW });
    expect((store.prize_pool_contributions ?? []).length).toBe(2);
    expect((store.tournament_prize_pools[0] as any).raised_amount_cents).toBe(
      4000
    );
  });

  it('montant invalide (0 / négatif) → invalid_amount, aucun effet', async () => {
    seedPool();
    const r = await applyPrizeContribution(correlation(), 'pay-5', 0, {
      nowMs: NOW,
    });
    expect(r.status).toBe('invalid_amount');
    expect((store.prize_pool_contributions ?? []).length).toBe(0);
    expect((store.tournament_prize_pools[0] as any).raised_amount_cents).toBe(
      0
    );
  });

  it('cagnotte inconnue → unknown_pool, aucun ledger', async () => {
    store.tournament_prize_pools = [] as any;
    const r = await applyPrizeContribution(correlation(), 'pay-6', 2500, {
      nowMs: NOW,
    });
    expect(r.status).toBe('unknown_pool');
    expect((store.prize_pool_contributions ?? []).length).toBe(0);
  });

  it('tenant de la contribution = tenant de la cagnotte (defense-in-depth)', async () => {
    seedPool();
    const r = await applyPrizeContribution(
      correlation({ tenantId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
      'pay-7',
      2500,
      { nowMs: NOW }
    );
    expect(r.status).toBe('applied');
    expect((store.prize_pool_contributions[0] as any).tenant_id).toBe(TENANT);
  });
});

/* ===========================================================================
 * Webhook end-to-end
 * =========================================================================*/

describe('/api/helloasso/webhook — contribution cagnotte', () => {
  const ORIG_SECRET = process.env.HELLOASSO_WEBHOOK_SECRET;
  afterEach(() => {
    if (ORIG_SECRET === undefined) delete process.env.HELLOASSO_WEBHOOK_SECRET;
    else process.env.HELLOASSO_WEBHOOK_SECRET = ORIG_SECRET;
  });

  function webhookReq(body: unknown): any {
    return {
      method: 'POST',
      headers: { host: 'h' },
      query: { token: 'right-secret' },
      body,
      socket: { remoteAddress: '127.0.0.1' },
    };
  }

  it('paiement prize → crédite la cagnotte (branche prize)', async () => {
    process.env.HELLOASSO_WEBHOOK_SECRET = 'right-secret';
    seedPool();
    const res = makeRes();
    await webhookHandler(
      webhookReq({
        eventType: 'Payment',
        data: {
          id: 6001,
          amount: 3000,
          state: 'Authorized',
          payer: { firstName: 'Zoe', lastName: 'D', email: 'z@x.com' },
          metadata: buildPrizeCheckoutMetadata(POOL, TENANT),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_prize_pools[0] as any).raised_amount_cents).toBe(
      3000
    );
    expect((store.prize_pool_contributions ?? []).length).toBe(1);
    // helloasso_payment_id stocké en TEXT.
    expect(
      (store.prize_pool_contributions[0] as any).helloasso_payment_id
    ).toBe('6001');
  });

  it('rejeu du même paiement → pas de double crédit', async () => {
    process.env.HELLOASSO_WEBHOOK_SECRET = 'right-secret';
    seedPool();
    const body = {
      eventType: 'Payment',
      data: {
        id: 6002,
        amount: 3000,
        state: 'Authorized',
        metadata: buildPrizeCheckoutMetadata(POOL, TENANT),
      },
    };
    await webhookHandler(webhookReq(body), makeRes());
    await webhookHandler(webhookReq(body), makeRes());
    expect((store.prize_pool_contributions ?? []).length).toBe(1);
    expect((store.tournament_prize_pools[0] as any).raised_amount_cents).toBe(
      3000
    );
  });

  it('don générique (sans metadata) → cagnotte inchangée', async () => {
    process.env.HELLOASSO_WEBHOOK_SECRET = 'right-secret';
    seedPool();
    await webhookHandler(
      webhookReq({
        eventType: 'Payment',
        data: {
          id: 6003,
          amount: 5000,
          state: 'Authorized',
          payer: { email: 'd@x.com' },
        },
      }),
      makeRes()
    );
    expect((store.tournament_prize_pools[0] as any).raised_amount_cents).toBe(
      0
    );
    expect((store.prize_pool_contributions ?? []).length).toBe(0);
  });

  it('paiement plan → branche plan intacte, branche prize non déclenchée', async () => {
    process.env.HELLOASSO_WEBHOOK_SECRET = 'right-secret';
    seedPool();
    store.tenants = [
      {
        id: TENANT,
        slug: 'conf',
        name: 'Conf',
        plan: 'discovery',
        plan_status: 'active',
        plan_started_at: null,
        plan_expires_at: null,
      },
    ] as any;
    await webhookHandler(
      webhookReq({
        eventType: 'Payment',
        data: {
          id: 6004,
          amount: 29000,
          state: 'Authorized',
          metadata: { kind: 'tenant_plan', tenant_id: TENANT, plan: 'regie' },
        },
      }),
      makeRes()
    );
    // Plan appliqué.
    expect((store.tenants[0] as any).plan).toBe('regie');
    expect((store.tenant_plan_payments ?? []).length).toBe(1);
    // Prize NON touché.
    expect((store.prize_pool_contributions ?? []).length).toBe(0);
    expect((store.tournament_prize_pools[0] as any).raised_amount_cents).toBe(
      0
    );
  });
});

/* ===========================================================================
 * POST /api/helloasso/prize-checkout
 * =========================================================================*/

describe('POST /api/helloasso/prize-checkout', () => {
  function req(body: unknown): any {
    return {
      method: 'POST',
      headers: { host: 'h' },
      query: {},
      body,
      socket: { remoteAddress: '127.0.0.1' },
    };
  }

  it('cagnotte ouverte → crée un intent + row pending, renvoie redirectUrl', async () => {
    seedPool();
    const res = makeRes();
    await prizeCheckoutHandler(
      req({
        tournamentId: TOURNAMENT,
        amountCents: 2500,
        contributorName: 'Alice',
        email: 'alice@x.com',
        message: 'Bravo',
        isAnonymous: false,
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.redirectUrl).toBe('https://helloasso.test/redirect/prize');
    // Metadata de corrélation transmise à HelloAsso.
    const arg = createCheckoutIntent.mock.calls[0][0];
    expect(arg.totalAmount).toBe(2500);
    expect(arg.metadata).toMatchObject({
      kind: 'prize_pool',
      prize_pool_id: POOL,
      tenant_id: TENANT,
    });
    expect(arg.returnUrl).toContain(`/tournament/${TOURNAMENT}?prize=success`);
    // Row checkout persistée (status pending, email capturé).
    const ck = store.prize_pool_checkouts[0] as any;
    expect(ck.status).toBe('pending');
    expect(ck.checkout_intent_id).toBe('424242');
    expect(ck.amount_cents).toBe(2500);
    expect(ck.contributor_email).toBe('alice@x.com');
  });

  it('résolution par prizePoolId explicite', async () => {
    seedPool();
    const res = makeRes();
    await prizeCheckoutHandler(
      req({ prizePoolId: POOL, amountCents: 1000 }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('cagnotte fermée → 400 POOL_CLOSED', async () => {
    seedPool({ is_open: false });
    const res = makeRes();
    await prizeCheckoutHandler(
      req({ tournamentId: TOURNAMENT, amountCents: 2500 }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('POOL_CLOSED');
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('cagnotte introuvable → 400 POOL_NOT_FOUND', async () => {
    store.tournament_prize_pools = [] as any;
    const res = makeRes();
    await prizeCheckoutHandler(
      req({ tournamentId: TOURNAMENT, amountCents: 2500 }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('POOL_NOT_FOUND');
  });

  it('montant sous le minimum → 400', async () => {
    seedPool();
    const res = makeRes();
    await prizeCheckoutHandler(
      req({ tournamentId: TOURNAMENT, amountCents: 50 }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET → 405', async () => {
    const res = makeRes();
    await prizeCheckoutHandler({ ...req({}), method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
});

/* ===========================================================================
 * GET public /api/tournaments/[id]/prize-pool
 * =========================================================================*/

describe('GET /api/tournaments/[id]/prize-pool', () => {
  function req(id: string): any {
    return {
      method: 'GET',
      headers: { host: 'h' },
      query: { id },
      socket: { remoteAddress: '127.0.0.1' },
    };
  }

  it('renvoie la jauge, masque email et anonymise', async () => {
    seedPool({ raised_amount_cents: 4000 });
    store.prize_pool_contributions = [
      {
        id: 'c1',
        prize_pool_id: POOL,
        tenant_id: TENANT,
        amount_cents: 2500,
        contributor_name: 'Alice',
        is_anonymous: false,
        message: 'Bravo',
        created_at: '2026-07-10T00:00:00.000Z',
      },
      {
        id: 'c2',
        prize_pool_id: POOL,
        tenant_id: TENANT,
        amount_cents: 1500,
        contributor_name: 'Bob',
        is_anonymous: true,
        message: null,
        created_at: '2026-07-11T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await publicPrizePoolHandler(req(TOURNAMENT), res);
    expect(res.statusCode).toBe(200);
    const b = res.body;
    expect(b.exists).toBe(true);
    expect(b.baseAmountCents).toBe(50000);
    expect(b.raisedAmountCents).toBe(4000);
    expect(b.totalCents).toBe(54000);
    expect(b.goalAmountCents).toBe(100000);
    expect(b.contributorCount).toBe(2);
    // Anonymisation : Bob → name null.
    const bob = b.recentContributors.find((c: any) => c.amountCents === 1500);
    expect(bob.name).toBeNull();
    const alice = b.recentContributors.find((c: any) => c.amountCents === 2500);
    expect(alice.name).toBe('Alice');
    // Jamais d'email exposé.
    expect(JSON.stringify(b)).not.toContain('email');
  });

  it('pas de cagnotte → forme vide (200)', async () => {
    store.tournament_prize_pools = [] as any;
    const res = makeRes();
    await publicPrizePoolHandler(req(TOURNAMENT), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.exists).toBe(false);
    expect(res.body.totalCents).toBe(0);
  });

  it('id invalide → 400', async () => {
    const res = makeRes();
    await publicPrizePoolHandler(req('not-a-uuid'), res);
    expect(res.statusCode).toBe(400);
  });
});

/* ===========================================================================
 * Admin /api/admin/tournaments/[id]/prize-pool
 * =========================================================================*/

function makeStaff(role: 'manager' | 'caster') {
  store.staff = [
    {
      id: STAFF_1,
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
}

function adminReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-1' },
    cookies: { staff_active_tenant_id: TENANT },
    query: { id: TOURNAMENT },
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

describe('admin /api/admin/tournaments/[id]/prize-pool', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    seedTournament();
  });

  it('manager PUT crée une cagnotte puis la met à jour', async () => {
    makeStaff('manager');
    invalidateStaffCache();
    // Create
    let res = makeRes();
    await adminPrizePoolHandler(
      adminReq({
        method: 'PUT',
        body: {
          title: 'Cash',
          goal_amount_cents: 100000,
          base_amount_cents: 20000,
          is_open: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.pool.is_open).toBe(true);
    expect((store.tournament_prize_pools ?? []).length).toBe(1);
    // Update (ferme la cagnotte)
    res = makeRes();
    await adminPrizePoolHandler(
      adminReq({ method: 'PUT', body: { is_open: false } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_prize_pools[0] as any).is_open).toBe(false);
    // raised_amount_cents jamais posé/touché par l'admin (géré par le webhook).
    expect(
      (store.tournament_prize_pools[0] as any).raised_amount_cents ?? 0
    ).toBe(0);
  });

  it('manager GET renvoie config + contributions + compteur', async () => {
    makeStaff('manager');
    invalidateStaffCache();
    seedPool({ raised_amount_cents: 2500 });
    store.prize_pool_contributions = [
      {
        id: 'c1',
        prize_pool_id: POOL,
        tenant_id: TENANT,
        amount_cents: 2500,
        contributor_name: 'Alice',
        is_anonymous: false,
        message: null,
        created_at: '2026-07-10T00:00:00.000Z',
        helloasso_payment_id: 'pay-x',
      },
    ] as any;
    const res = makeRes();
    await adminPrizePoolHandler(adminReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.pool.total_cents).toBe(52500);
    expect(res.body.contributions.length).toBe(1);
    expect(res.body.contributorCount).toBe(1);
  });

  it('caster (rôle insuffisant) → 403', async () => {
    makeStaff('caster');
    invalidateStaffCache();
    const res = makeRes();
    await adminPrizePoolHandler(adminReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('tournoi inconnu → 404', async () => {
    makeStaff('manager');
    invalidateStaffCache();
    store.tournaments = [] as any;
    const res = makeRes();
    await adminPrizePoolHandler(adminReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(404);
  });
});
