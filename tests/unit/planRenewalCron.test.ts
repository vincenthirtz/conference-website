// tests/unit/planRenewalCron.test.ts
//
// Cron « plan-renewal » — cycle de vie des abonnements org self-serve.
// Target: pages/api/cron/plan-renewal.ts (+ re-arm dans utils/billing/tenantPlanBilling).
//
// Couvre :
//   - active + expiré → past_due (pas de relance).
//   - active + expire bientôt + jamais relancé → relance envoyée + stamp posé.
//   - déjà relancé ce cycle → pas de doublon.
//   - foundation / discovery jamais touchés (hors scope de la requête).
//   - auth : CRON_SECRET absent → 500 ; mauvais secret → 401.
//   - applyTenantPlanPayment : paiement frais → plan_last_reminder_at=NULL +
//     plan_status='active'.
//
// supabase + rateLimit sont auto-mockés par tests/unit/__helpers__/testSetup.ts.
// @/utils/email est mocké par fichier (on capture les relances émises).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { sendPlanRenewalReminderEmail } = vi.hoisted(() => ({
  sendPlanRenewalReminderEmail: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/utils/email', () => ({ sendPlanRenewalReminderEmail }));

import {
  store,
  resetSupabaseMock,
  setAdminUser,
} from './__helpers__/supabaseMock';

import cronHandler, { runPlanRenewal } from '@/pages/api/cron/plan-renewal';
import { applyTenantPlanPayment } from '@/utils/billing/tenantPlanBilling';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OWNER_STAFF = '22222222-2222-4222-8222-222222222222';
const OWNER_AUTH = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-07-13T12:00:00.000Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function makeReq(over: Partial<any> = {}): any {
  return { method: 'POST', headers: {}, query: {}, body: {}, ...over };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Seed un owner (staff role=owner + tenant_staff + email admin) pour un tenant. */
function seedOwner(tenantId: string, email: string) {
  (store.tenant_staff ||= []).push({
    tenant_id: tenantId,
    staff_id: OWNER_STAFF,
  });
  (store.staff ||= []).push({
    id: OWNER_STAFF,
    auth_user_id: OWNER_AUTH,
    role: 'owner',
    is_active: true,
    deleted_at: null,
  });
  setAdminUser(OWNER_AUTH, email);
}

describe('runPlanRenewal — lifecycle', () => {
  beforeEach(() => {
    resetSupabaseMock();
    sendPlanRenewalReminderEmail.mockClear();
  });

  it('marks an active + expired paid plan as past_due (no reminder)', async () => {
    store.tenants = [
      {
        id: TENANT,
        plan: 'regie',
        plan_status: 'active',
        plan_expires_at: iso(NOW - DAY),
        plan_last_reminder_at: null,
      },
    ] as any;

    const c = await runPlanRenewal(NOW);

    expect(c.checked).toBe(1);
    expect(c.markedPastDue).toBe(1);
    expect(c.remindersSent).toBe(0);
    expect(store.tenants[0].plan_status).toBe('past_due');
    expect(sendPlanRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it('sends a renewal reminder for an active plan expiring soon and stamps plan_last_reminder_at', async () => {
    store.tenants = [
      {
        id: TENANT,
        plan: 'circuit',
        plan_status: 'active',
        plan_expires_at: iso(NOW + 10 * DAY),
        plan_last_reminder_at: null,
      },
    ] as any;
    seedOwner(TENANT, 'owner@example.test');

    const c = await runPlanRenewal(NOW);

    expect(c.markedPastDue).toBe(0);
    expect(c.remindersSent).toBe(1);
    expect(sendPlanRenewalReminderEmail).toHaveBeenCalledTimes(1);
    expect(sendPlanRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.test',
        planLabel: 'Circuit',
        priceEur: 790,
      })
    );
    // Stamp posé → pas de re-relance au prochain run.
    expect(store.tenants[0].plan_last_reminder_at).toBe(iso(NOW));
  });

  it('un essai expiré retombe sur discovery, pas sur past_due', async () => {
    // Un essai n'a jamais rien dû : le marquer « past_due » afficherait un
    // impayé fictif. Il redescend donc proprement sur le palier gratuit.
    store.tenants = [
      {
        id: TENANT,
        plan: 'regie',
        plan_status: 'active',
        plan_is_trial: true,
        plan_expires_at: iso(NOW - DAY),
        plan_last_reminder_at: null,
      },
    ] as any;

    const c = await runPlanRenewal(NOW);

    expect(c.trialsEnded).toBe(1);
    expect(c.markedPastDue).toBe(0);
    expect(store.tenants[0].plan).toBe('discovery');
    expect(store.tenants[0].plan_status).toBe('active');
    expect(store.tenants[0].plan_is_trial).toBe(false);
    expect(store.tenants[0].plan_expires_at).toBeNull();
  });

  it('la relance d’un essai parle de fin d’essai (isTrial passé à l’email)', async () => {
    store.tenants = [
      {
        id: TENANT,
        plan: 'regie',
        plan_status: 'active',
        plan_is_trial: true,
        plan_expires_at: iso(NOW + 10 * DAY),
        plan_last_reminder_at: null,
      },
    ] as any;
    seedOwner(TENANT, 'owner@example.test');

    const c = await runPlanRenewal(NOW);

    expect(c.remindersSent).toBe(1);
    expect(sendPlanRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ isTrial: true })
    );
  });

  it('does not re-send when already reminded this cycle', async () => {
    store.tenants = [
      {
        id: TENANT,
        plan: 'regie',
        plan_status: 'active',
        plan_expires_at: iso(NOW + 10 * DAY),
        // Relance récente (> expiry - 30j) → même cycle.
        plan_last_reminder_at: iso(NOW - DAY),
      },
    ] as any;
    seedOwner(TENANT, 'owner@example.test');

    const c = await runPlanRenewal(NOW);

    expect(c.remindersSent).toBe(0);
    expect(sendPlanRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it('re-sends when the last reminder predates this cycle (older than expiry - 30d)', async () => {
    store.tenants = [
      {
        id: TENANT,
        plan: 'regie',
        plan_status: 'active',
        plan_expires_at: iso(NOW + 10 * DAY),
        // Relance du cycle PRÉCÉDENT (bien avant expiry - 30j).
        plan_last_reminder_at: iso(NOW - 60 * DAY),
      },
    ] as any;
    seedOwner(TENANT, 'owner@example.test');

    const c = await runPlanRenewal(NOW);

    expect(c.remindersSent).toBe(1);
    expect(sendPlanRenewalReminderEmail).toHaveBeenCalledTimes(1);
  });

  it('never touches foundation / discovery tenants', async () => {
    store.tenants = [
      {
        id: 'f0000000-0000-4000-8000-000000000000',
        plan: 'foundation',
        plan_status: 'active',
        plan_expires_at: iso(NOW - DAY), // expiré, mais hors scope
        plan_last_reminder_at: null,
      },
      {
        id: 'd0000000-0000-4000-8000-000000000000',
        plan: 'discovery',
        plan_status: 'active',
        plan_expires_at: iso(NOW + 5 * DAY),
        plan_last_reminder_at: null,
      },
    ] as any;

    const c = await runPlanRenewal(NOW);

    expect(c.checked).toBe(0);
    expect(c.markedPastDue).toBe(0);
    expect(c.remindersSent).toBe(0);
    // Le tenant foundation expiré reste actif (aucune bascule).
    expect(store.tenants[0].plan_status).toBe('active');
    expect(sendPlanRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it('skips the reminder (no stamp) when the tenant has no owner email', async () => {
    store.tenants = [
      {
        id: TENANT,
        plan: 'regie',
        plan_status: 'active',
        plan_expires_at: iso(NOW + 10 * DAY),
        plan_last_reminder_at: null,
      },
    ] as any;
    // Pas d'owner seedé.

    const c = await runPlanRenewal(NOW);

    expect(c.remindersSent).toBe(0);
    expect(store.tenants[0].plan_last_reminder_at).toBeNull();
    expect(sendPlanRenewalReminderEmail).not.toHaveBeenCalled();
  });
});

describe('plan-renewal cron handler — auth (fail-closed)', () => {
  const prev = process.env.CRON_SECRET;
  const SECRET = 'cron-secret-xyz';

  beforeEach(() => {
    resetSupabaseMock();
    sendPlanRenewalReminderEmail.mockClear();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it('500s when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = makeRes();
    await cronHandler(
      makeReq({ headers: { authorization: 'Bearer whatever' } }),
      res
    );
    expect(res.statusCode).toBe(500);
  });

  it('401s on a wrong secret', async () => {
    process.env.CRON_SECRET = SECRET;
    const res = makeRes();
    await cronHandler(
      makeReq({ headers: { authorization: 'Bearer nope' } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('200s with the right Bearer secret', async () => {
    process.env.CRON_SECRET = SECRET;
    store.tenants = [] as any;
    const res = makeRes();
    await cronHandler(
      makeReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as { success?: boolean }).success).toBe(true);
  });
});

describe('applyTenantPlanPayment — re-arms the reminder on a fresh payment', () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it('clears plan_last_reminder_at and sets plan_status=active', async () => {
    store.tenants = [
      {
        id: TENANT,
        plan: 'regie',
        plan_status: 'past_due',
        plan_started_at: iso(NOW - 400 * DAY),
        plan_expires_at: iso(NOW - 5 * DAY),
        plan_last_reminder_at: iso(NOW - 20 * DAY),
      },
    ] as any;
    store.tenant_plan_payments = [] as any;

    const result = await applyTenantPlanPayment({
      helloassoPaymentId: 424242,
      tenantId: TENANT,
      plan: 'regie',
      amountCents: 290 * 100,
      checkoutIntentId: null,
      nowMs: NOW,
    });

    expect(result.status).toBe('applied');
    expect(store.tenants[0].plan_status).toBe('active');
    expect(store.tenants[0].plan_last_reminder_at).toBeNull();
    // Ledger d'idempotence écrit.
    expect(
      (store.tenant_plan_payments ?? []).some(
        (r) => r.helloasso_payment_id === 424242
      )
    ).toBe(true);
  });
});
