// tests/unit/tenantPlanBilling.test.ts
//
// « Régie solidaire » — Phase 1 : don HelloAsso ciblé → activation /
// renouvellement automatique du plan d'un tenant.
//
// Couvre :
//  - le barème PLAN_PRICES_EUR + isPurchasablePlan
//  - addOneYearIso
//  - resolvePlanCorrelation (metadata primaire, fallback mapping, don générique)
//  - applyTenantPlanPayment (activation, extension, idempotence, montant)
//  - le webhook de bout en bout (activation, rejeu idempotent, extension,
//    don générique inchangé)
//  - l'endpoint POST /api/admin/tenants/[id]/plan-checkout (owner OK, admin 403)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock supabase (in-memory) — partagé par les utils, le webhook et l'endpoint.
vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

// createCheckoutIntent mocké (pas d'appel réseau HelloAsso), reste du module réel.
const createCheckoutIntent = vi.hoisted(() =>
  vi.fn<(...args: any[]) => any>(async () => ({
    id: 987654,
    redirectUrl: 'https://helloasso.test/redirect/xyz',
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
  PLAN_PRICES_EUR,
  PLAN_PRICES_MONTHLY_EUR,
  YEARLY_MONTHS_BILLED,
  isPurchasablePlan,
  planPrice,
  type TenantPlan,
} from '../../utils/billing/planFeatures';
import {
  resolvePlanCorrelation,
  applyTenantPlanPayment,
  addOneYearIso,
  addTermIso,
  buildPlanCheckoutMetadata,
} from '../../utils/billing/tenantPlanBilling';
import type { HelloAssoWebhookEvent } from '../../utils/helloasso';

import webhookHandler from '../../pages/api/helloasso/webhook';
import planCheckoutHandler from '../../pages/api/admin/tenants/[id]/plan-checkout';

const TENANT = '11111111-1111-4111-8111-111111111111';
const STAFF_1 = '55555555-5555-4555-8555-555555555555';
const NOW = Date.parse('2026-07-09T12:00:00Z');

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
 * Barème
 * =========================================================================*/

describe('PLAN_PRICES_EUR + isPurchasablePlan', () => {
  it('barème cohérent avec les plans', () => {
    // `foundation` reste à 0 : c'est la Coupe elle-même, offerte par mission.
    // `discovery` est devenue une offre facturée (10 €/mois) tout en restant
    // l'état vers lequel un plan non honoré retombe — cet état-là n'encaisse
    // rien.
    expect(PLAN_PRICES_EUR.foundation).toBe(0);
    expect(PLAN_PRICES_EUR.discovery).toBe(100);
    expect(PLAN_PRICES_EUR.regie).toBe(290);
    expect(PLAN_PRICES_EUR.circuit).toBe(790);
  });

  it('le mensuel est dérivé de l’annuel, jamais recopié', () => {
    // Deux mois offerts à l'année : 10 mois facturés sur 12. Un prix mensuel
    // saisi à la main finirait par contredire l'annuel, et c'est le genre de
    // contradiction qu'on découvre sur une facture.
    expect(PLAN_PRICES_MONTHLY_EUR.discovery).toBe(10);
    expect(PLAN_PRICES_MONTHLY_EUR.regie).toBe(29);
    expect(PLAN_PRICES_MONTHLY_EUR.circuit).toBe(79);

    for (const plan of ['discovery', 'regie', 'circuit'] as const) {
      const yearly = PLAN_PRICES_EUR[plan] as number;
      expect(PLAN_PRICES_MONTHLY_EUR[plan]).toBe(
        Math.round(yearly / YEARLY_MONTHS_BILLED)
      );
      // Payer au mois coûte plus cher sur douze mois : c'est ce qui rend
      // l'annuel intéressant, et ça doit rester vrai après tout changement.
      expect((PLAN_PRICES_MONTHLY_EUR[plan] as number) * 12).toBeGreaterThan(
        yearly
      );
    }
  });

  it('addTermIso prolonge de la période payée', () => {
    const base = Date.parse('2026-01-31T12:00:00.000Z');
    expect(addTermIso(base, 'year')).toBe('2027-01-31T12:00:00.000Z');
    // Fin de mois : un paiement du 31 janvier reporte au 3 mars. C'est le
    // comportement de tous les abonnements ; le « corriger » produirait des
    // dates fausses une fois par an.
    expect(addTermIso(base, 'month').slice(0, 10)).toBe('2026-03-03');
  });

  it('une entrée par plan (pas de plan orphelin)', () => {
    // La liste des plans était recopiée ici à la main : ajouter un palier au
    // type sans l'ajouter au barème passait le compilateur et cassait ce test
    // à l'exécution, ce qui est déjà tard. `satisfies Record<TenantPlan, true>`
    // fait porter l'exhaustivité au compilateur — un plan manquant ou en trop
    // ne compile plus.
    const plans = Object.keys({
      foundation: true,
      discovery: true,
      regie: true,
      circuit: true,
      editor: true,
    } satisfies Record<TenantPlan, true>) as TenantPlan[];

    for (const p of plans) {
      expect(p in PLAN_PRICES_EUR).toBe(true);
    }
    expect(Object.keys(PLAN_PRICES_EUR).sort()).toEqual(plans.sort());
  });

  it('les trois offres facturées sont achetables, pas la Coupe', () => {
    expect(isPurchasablePlan('discovery')).toBe(true);
    expect(isPurchasablePlan('regie')).toBe(true);
    expect(isPurchasablePlan('circuit')).toBe(true);
    // `foundation` est offerte par mission : rien à encaisser.
    expect(isPurchasablePlan('foundation')).toBe(false);
    // Un plan retiré du barème ne redevient pas achetable par accident.
    expect(isPurchasablePlan('editor')).toBe(false);
    expect(isPurchasablePlan('bogus')).toBe(false);
  });
});

describe('addOneYearIso', () => {
  it('ajoute exactement un an (UTC)', () => {
    expect(addOneYearIso(Date.parse('2026-07-09T12:00:00Z'))).toBe(
      '2027-07-09T12:00:00.000Z'
    );
  });
  it('gère le 29 février (année bissextile → non bissextile)', () => {
    // 2028 est bissextile ; +1 an → 2029-03-01 (JS normalise le 29 fév).
    const out = addOneYearIso(Date.parse('2028-02-29T00:00:00Z'));
    expect(out.startsWith('2029-03-01')).toBe(true);
  });
});

/* ===========================================================================
 * resolvePlanCorrelation
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
      amount: 29000,
      state: 'Authorized',
      ...(metadata ? { metadata } : {}),
      ...over,
    },
  };
}

describe('resolvePlanCorrelation', () => {
  it('metadata (data.metadata) : canal primaire', async () => {
    const c = await resolvePlanCorrelation(
      paymentEvent({}, buildPlanCheckoutMetadata(TENANT, 'regie'))
    );
    expect(c).toMatchObject({
      tenantId: TENANT,
      plan: 'regie',
      source: 'metadata',
    });
  });

  it("metadata à la racine (event.metadata) : fallback d'emplacement", async () => {
    const c = await resolvePlanCorrelation(
      paymentEvent({}, undefined, buildPlanCheckoutMetadata(TENANT, 'circuit'))
    );
    expect(c).toMatchObject({
      tenantId: TENANT,
      plan: 'circuit',
      source: 'metadata',
    });
  });

  it('don générique (aucune metadata) → null (inchangé)', async () => {
    const c = await resolvePlanCorrelation(
      paymentEvent({ payer: { email: 'p@x.com' } })
    );
    expect(c).toBeNull();
  });

  it('metadata invalide (mauvais kind / plan non achetable) → null', async () => {
    expect(
      await resolvePlanCorrelation(
        paymentEvent({}, { kind: 'other', tenant_id: TENANT, plan: 'regie' })
      )
    ).toBeNull();
    expect(
      await resolvePlanCorrelation(
        paymentEvent(
          {},
          { kind: 'tenant_plan', tenant_id: TENANT, plan: 'editor' }
        )
      )
    ).toBeNull();
  });

  it('fallback mapping tenant_plan_checkouts via checkout_intent_id', async () => {
    store.tenant_plan_checkouts = [
      { checkout_intent_id: 555, tenant_id: TENANT, plan: 'regie' },
    ] as any;
    const c = await resolvePlanCorrelation(
      paymentEvent({ checkoutIntentId: 555 })
    );
    expect(c).toMatchObject({
      tenantId: TENANT,
      plan: 'regie',
      source: 'checkout_mapping',
      checkoutIntentId: 555,
    });
  });
});

/* ===========================================================================
 * applyTenantPlanPayment
 * =========================================================================*/

function seedTenant(over: Record<string, unknown> = {}) {
  store.tenants = [
    {
      id: TENANT,
      slug: 'alpha',
      name: 'Alpha',
      plan: 'discovery',
      plan_status: 'active',
      plan_started_at: null,
      plan_expires_at: null,
      ...over,
    },
  ] as any;
}

describe('cohérence mensuel / annuel', () => {
  it('douze mensualités coûtent PLUS que le terme annuel', () => {
    // C'est toute la promesse « deux mois offerts ». La page publique
    // l'affirmait au-dessus de la grille, et écrivait juste en dessous « 29 €
    // / mois — soit 290 € à l'année » : 290 € est le prix du TERME annuel, pas
    // le coût de douze mensualités (348 €). La page se contredisait donc
    // elle-même, en annonçant au passage 58 € de moins que le vrai total.
    for (const plan of ['discovery', 'regie', 'circuit'] as const) {
      const monthly = planPrice(plan, 'month') as number;
      const yearly = planPrice(plan, 'year') as number;
      expect(monthly * 12).toBeGreaterThan(yearly);
      expect(monthly * 12 - yearly).toBe(monthly * (12 - YEARLY_MONTHS_BILLED));
    }
  });

  it('le mensuel affiché redonne EXACTEMENT l’annuel', () => {
    // Le mensuel est dérivé par division + arrondi. Tant que chaque prix annuel
    // est un multiple de YEARLY_MONTHS_BILLED, l'arrondi ne coûte rien ; le
    // jour où un prix ne l'est plus, le barème affiché cesserait discrètement
    // de correspondre au barème encaissé.
    for (const plan of Object.keys(PLAN_PRICES_EUR) as TenantPlan[]) {
      const yearly = PLAN_PRICES_EUR[plan];
      if (typeof yearly !== 'number' || yearly === 0) continue;
      expect(PLAN_PRICES_MONTHLY_EUR[plan]! * YEARLY_MONTHS_BILLED).toBe(
        yearly
      );
    }
  });
});

describe('applyTenantPlanPayment', () => {
  it('un paiement mensuel inscrit la périodicité SUR le tenant', async () => {
    // Sans cette colonne, la périodicité ne survivait pas à l'encaissement :
    // elle restait sur le checkout et le paiement. Tout ce qui parle du plan
    // ensuite — la relance d'échéance, la page de facturation — retombait sur
    // le barème annuel et annonçait 290 € à quelqu'un qui paie 29 €.
    seedTenant();
    const r = await applyTenantPlanPayment({
      helloassoPaymentId: 42,
      tenantId: TENANT,
      plan: 'regie',
      amountCents: 2900,
      checkoutIntentId: 987,
      nowMs: NOW,
      term: 'month',
    });
    expect(r.status).toBe('applied');
    const t = store.tenants[0] as any;
    expect(t.plan_term).toBe('month');
    // Un mois payé, un mois donné.
    expect(t.plan_expires_at).toBe(
      new Date(Date.UTC(2026, 7, 9, 12, 0, 0)).toISOString()
    );
  });

  it('active un tenant discovery → regie actif, expire ≈ now+1an', async () => {
    seedTenant();
    const r = await applyTenantPlanPayment({
      helloassoPaymentId: 1,
      tenantId: TENANT,
      plan: 'regie',
      amountCents: 29000,
      checkoutIntentId: 987,
      nowMs: NOW,
    });
    expect(r.status).toBe('applied');
    const t = store.tenants[0] as any;
    expect(t.plan).toBe('regie');
    expect(t.plan_status).toBe('active');
    expect(t.plan_started_at).toBe('2026-07-09T12:00:00.000Z');
    expect(t.plan_expires_at).toBe('2027-07-09T12:00:00.000Z');
    // Ledger écrit.
    expect((store.tenant_plan_payments ?? []).length).toBe(1);
  });

  it('rejeu du même helloasso_payment_id → idempotent (pas de double extension)', async () => {
    seedTenant();
    const args = {
      helloassoPaymentId: 42,
      tenantId: TENANT,
      plan: 'regie' as const,
      amountCents: 29000,
      checkoutIntentId: null,
      nowMs: NOW,
    };
    const r1 = await applyTenantPlanPayment(args);
    expect(r1.status).toBe('applied');
    const firstExpiry = (store.tenants[0] as any).plan_expires_at;

    const r2 = await applyTenantPlanPayment(args);
    expect(r2.status).toBe('already_applied');
    // Expiry inchangé + un seul ledger.
    expect((store.tenants[0] as any).plan_expires_at).toBe(firstExpiry);
    expect((store.tenant_plan_payments ?? []).length).toBe(1);
  });

  it('paiement avant expiration → extension (base = expiry actuel)', async () => {
    // Tenant regie actif expirant dans 3 mois.
    const currentExpiry = '2026-10-09T12:00:00.000Z';
    seedTenant({
      plan: 'regie',
      plan_status: 'active',
      plan_started_at: '2025-10-09T12:00:00.000Z',
      plan_expires_at: currentExpiry,
    });
    const r = await applyTenantPlanPayment({
      helloassoPaymentId: 7,
      tenantId: TENANT,
      plan: 'regie',
      amountCents: 29000,
      checkoutIntentId: null,
      nowMs: NOW,
    });
    expect(r.status).toBe('applied');
    const t = store.tenants[0] as any;
    // Base = expiry actuel (2026-10-09) + 1 an → 2027-10-09 (pas now+1an).
    expect(t.plan_expires_at).toBe('2027-10-09T12:00:00.000Z');
    // plan_started_at préservé (COALESCE existant).
    expect(t.plan_started_at).toBe('2025-10-09T12:00:00.000Z');
  });

  it('paiement après expiration → réactivation (base = now)', async () => {
    seedTenant({
      plan: 'regie',
      plan_status: 'active',
      plan_started_at: '2024-01-01T00:00:00.000Z',
      plan_expires_at: '2026-01-01T00:00:00.000Z', // déjà expiré vs NOW
    });
    const r = await applyTenantPlanPayment({
      helloassoPaymentId: 8,
      tenantId: TENANT,
      plan: 'regie',
      amountCents: 29000,
      checkoutIntentId: null,
      nowMs: NOW,
    });
    expect(r.status).toBe('applied');
    expect((store.tenants[0] as any).plan_expires_at).toBe(
      '2027-07-09T12:00:00.000Z'
    );
  });

  it('paiement pendant un essai → un an à partir de maintenant, essai clos', async () => {
    // L'essai est une découverte, pas un acompte : les jours restants ne
    // s'ajoutent pas à l'année payée.
    seedTenant({
      plan: 'regie',
      plan_status: 'active',
      plan_is_trial: true,
      plan_started_at: '2026-07-01T12:00:00.000Z',
      plan_expires_at: '2026-08-01T12:00:00.000Z', // essai encore actif vs NOW
    });
    const r = await applyTenantPlanPayment({
      helloassoPaymentId: 42,
      tenantId: TENANT,
      plan: 'regie',
      amountCents: 29000,
      checkoutIntentId: null,
      nowMs: NOW,
    });
    expect(r.status).toBe('applied');
    const t = store.tenants[0] as any;
    expect(t.plan_expires_at).toBe('2027-07-09T12:00:00.000Z');
    expect(t.plan_is_trial).toBe(false);
  });

  it("montant insuffisant → n'active pas, pas de ledger", async () => {
    seedTenant();
    const r = await applyTenantPlanPayment({
      helloassoPaymentId: 9,
      tenantId: TENANT,
      plan: 'regie',
      amountCents: 1000, // < 29000
      checkoutIntentId: null,
      nowMs: NOW,
    });
    expect(r.status).toBe('insufficient_amount');
    expect((store.tenants[0] as any).plan).toBe('discovery');
    expect((store.tenant_plan_payments ?? []).length).toBe(0);
  });

  it('tenant inconnu → unknown_tenant, aucun effet', async () => {
    store.tenants = [] as any;
    const r = await applyTenantPlanPayment({
      helloassoPaymentId: 10,
      tenantId: TENANT,
      plan: 'regie',
      amountCents: 29000,
      checkoutIntentId: null,
      nowMs: NOW,
    });
    expect(r.status).toBe('unknown_tenant');
    expect((store.tenant_plan_payments ?? []).length).toBe(0);
  });
});

/* ===========================================================================
 * Webhook end-to-end
 * =========================================================================*/

describe('/api/helloasso/webhook — don ciblé plan', () => {
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

  it('paiement regie sur tenant discovery → tenant passe regie actif', async () => {
    process.env.HELLOASSO_WEBHOOK_SECRET = 'right-secret';
    seedTenant();
    const res = makeRes();
    await webhookHandler(
      webhookReq({
        eventType: 'Payment',
        data: {
          id: 2001,
          amount: 29000,
          state: 'Authorized',
          payer: { email: 'partner@x.com' },
          metadata: buildPlanCheckoutMetadata(TENANT, 'regie'),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const t = store.tenants[0] as any;
    expect(t.plan).toBe('regie');
    expect(t.plan_status).toBe('active');
    expect((store.tenant_plan_payments ?? []).length).toBe(1);
  });

  it('rejeu du même helloasso_payment_id → pas de double extension', async () => {
    process.env.HELLOASSO_WEBHOOK_SECRET = 'right-secret';
    seedTenant();
    const body = {
      eventType: 'Payment',
      data: {
        id: 2002,
        amount: 29000,
        state: 'Authorized',
        metadata: buildPlanCheckoutMetadata(TENANT, 'regie'),
      },
    };
    await webhookHandler(webhookReq(body), makeRes());
    const firstExpiry = (store.tenants[0] as any).plan_expires_at;
    await webhookHandler(webhookReq(body), makeRes());
    expect((store.tenants[0] as any).plan_expires_at).toBe(firstExpiry);
    expect((store.tenant_plan_payments ?? []).length).toBe(1);
  });

  it('don générique (sans metadata plan) → tenant inchangé', async () => {
    process.env.HELLOASSO_WEBHOOK_SECRET = 'right-secret';
    seedTenant();
    const res = makeRes();
    await webhookHandler(
      webhookReq({
        eventType: 'Payment',
        data: {
          id: 2003,
          amount: 5000,
          state: 'Authorized',
          payer: { email: 'donor@x.com' },
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const t = store.tenants[0] as any;
    expect(t.plan).toBe('discovery');
    expect((store.tenant_plan_payments ?? []).length).toBe(0);
  });
});

/* ===========================================================================
 * Endpoint POST /api/admin/tenants/[id]/plan-checkout
 * =========================================================================*/

function makeStaff(role: 'owner' | 'admin') {
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
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t-1' },
    cookies: { staff_active_tenant_id: TENANT },
    query: { id: TENANT },
    body: { plan: 'regie' },
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

describe('POST /api/admin/tenants/[id]/plan-checkout', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    seedTenant();
  });

  it('owner : génère un lien de paiement et renvoie redirectUrl', async () => {
    makeStaff('owner');
    invalidateStaffCache();
    const res = makeRes();
    await planCheckoutHandler(adminReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.redirectUrl).toBe('https://helloasso.test/redirect/xyz');
    expect(body.plan).toBe('regie');
    expect(body.amountEur).toBe(290);
    expect(body.checkoutIntentId).toBe(987654);
    // Metadata de corrélation transmise à HelloAsso.
    const arg = createCheckoutIntent.mock.calls[0][0];
    expect(arg.totalAmount).toBe(29000);
    expect(arg.metadata).toMatchObject({
      kind: 'tenant_plan',
      tenant_id: TENANT,
      plan: 'regie',
    });
    // Mapping persisté.
    expect((store.tenant_plan_checkouts ?? []).length).toBe(1);
  });

  it('admin (non owner) → 403', async () => {
    makeStaff('admin');
    invalidateStaffCache();
    const res = makeRes();
    await planCheckoutHandler(adminReq(), res);
    expect(res.statusCode).toBe(403);
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('plan hors barème → 400', async () => {
    // `editor` est SUR DEVIS (prix catalogue `null`) : un lien de paiement pour
    // lui ne doit pas se fabriquer, et surtout pas silencieusement à 0 €. C'est
    // toute la différence entre « pas de tarif » et « gratuit ».
    makeStaff('owner');
    invalidateStaffCache();
    const res = makeRes();
    await planCheckoutHandler(adminReq({ body: { plan: 'editor' } }), res);
    expect(res.statusCode).toBe(400);
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('tenant inconnu → 404', async () => {
    makeStaff('owner');
    invalidateStaffCache();
    store.tenants = [] as any;
    const res = makeRes();
    await planCheckoutHandler(adminReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('GET → 405', async () => {
    makeStaff('owner');
    invalidateStaffCache();
    const res = makeRes();
    await planCheckoutHandler(adminReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
