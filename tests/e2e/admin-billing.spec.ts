// E2E — pages/admin/billing.tsx (« Abonnement »), lot A10.
//
//   (a) l'écran s'affiche : plan courant, catalogue, historique de paiement ;
//   (b) action principale : commander une offre. Le premier clic n'achète
//       rien (récapitulatif), le second part SEULEMENT avec les deux
//       consentements, et la périodicité choisie part dans la requête.
//
// Auth = vraie connexion OWNER (checkout réservé) ; toutes les routes API de
// l'écran sont mockées — aucun lien de paiement réel n'est généré.

import { test, expect } from '@playwright/test';
import {
  loginStaff,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';
import {
  STAFF_PASSWORD,
  E2E_TENANT_ID,
  captureJson,
  dismissNextDevOverlay,
  mockActiveTenant,
  mockJson,
} from './_helpers/adminScreenMocks';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';
import { getPlanFeatures } from '../../utils/billing/planFeatures';

const OWNER_EMAIL = perWorker('hirtzvincent+e2e-billing-owner@gmail.com');

const BILLING = {
  plan: 'discovery',
  planLabel: 'Découverte',
  planStatus: 'active',
  planStartedAt: '2026-09-01T00:00:00.000Z',
  planExpiresAt: null,
  daysRemaining: null,
  isTrial: false,
  effectivePlan: 'discovery',
  planTerm: 'year',
  inGrace: false,
  graceEndsAt: null,
  nonprofitFree: false,
  nonprofitOrgName: null,
  nonprofitRna: null,
  nonprofitVerifiedVia: null,
  capabilities: getPlanFeatures('discovery'),
  catalog: [
    { plan: 'regie', label: 'Régie', priceEur: 290, monthlyPriceEur: 29 },
    { plan: 'circuit', label: 'Circuit', priceEur: 590, monthlyPriceEur: 59 },
  ],
  payments: [
    {
      id: 1,
      plan: 'regie',
      amountCents: 29000,
      paidAt: '2025-09-01T00:00:00.000Z',
      helloassoPaymentId: 424242,
    },
  ],
};

test.describe('Admin — Abonnement', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(OWNER_EMAIL);
    await createTestStaff(OWNER_EMAIL, STAFF_PASSWORD, 'owner');
  });

  test.afterAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(OWNER_EMAIL);
  });

  test('affiche le plan et commande une offre avec les deux consentements', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // HelloAsso s'ouvre dans un nouvel onglet : on l'empêche, on le note.
    await page.addInitScript(() => {
      (window as any).__opened = [];
      window.open = ((u: string) => {
        (window as any).__opened.push(u);
        return null;
      }) as typeof window.open;
    });
    await mockActiveTenant(page);
    await mockJson(
      page,
      `/api/admin/tenants/${E2E_TENANT_ID}/billing`,
      BILLING
    );
    const checkout = await captureJson(
      page,
      `/api/admin/tenants/${E2E_TENANT_ID}/plan-checkout`,
      {
        redirectUrl: 'https://example.test/checkout',
        checkoutIntentId: 1,
        plan: 'regie',
        amountEur: 29,
      }
    );

    await loginStaff(page, OWNER_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/billing');
    await expect(
      page.getByRole('heading', { name: 'Abonnement', level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);

    await expect(page.getByTestId('billing-current-plan')).toContainText(
      'Découverte'
    );
    await expect(page.getByTestId('billing-plan-regie')).toBeVisible();
    await expect(page.getByTestId('billing-payments')).toContainText('424242');

    // Périodicité mensuelle, puis premier clic : récapitulatif, rien d'envoyé.
    await page.getByTestId('billing-term-month').click();
    await page.getByTestId('billing-checkout-regie').click();
    await expect(page.getByTestId('billing-order-regie')).toBeVisible();
    expect(checkout.requests).toHaveLength(0);

    await page.getByTestId('billing-consent-cgv').check();
    await page.getByTestId('billing-consent-waiver').check();
    await page.getByTestId('billing-order-submit-regie').click();

    await expect.poll(() => checkout.requests.length).toBe(1);
    expect(checkout.requests[0].body).toMatchObject({
      plan: 'regie',
      term: 'month',
      cgvAccepted: true,
      immediateExecutionWaiver: true,
    });
    await expect
      .poll(() => page.evaluate(() => (window as any).__opened))
      .toEqual(['https://example.test/checkout']);
  });
});
