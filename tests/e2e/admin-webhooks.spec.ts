// E2E — pages/admin/webhooks.tsx (« Webhooks sortants »), lot A10.
//
//   (a) l'écran s'affiche : formulaire + liste des abonnements existants ;
//   (b) action principale : créer un abonnement. La validation côté écran
//       bloque l'envoi sans événement ; une fois valide, le POST porte l'URL et
//       les événements cochés, et le secret est révélé UNE fois.
//
// Auth = vraie connexion admin ; /api/admin/webhooks est mocké (aucun
// abonnement réel créé, aucun appel sortant).

import { test, expect } from '@playwright/test';
import {
  loginStaff,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';
import {
  STAFF_PASSWORD,
  captureJson,
  dismissNextDevOverlay,
  mockActiveTenant,
  mockJson,
} from './_helpers/adminScreenMocks';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const ADMIN_EMAIL = perWorker('hirtzvincent+e2e-webhooks@gmail.com');

const EXISTING = {
  id: '44444444-4444-4444-8444-444444444444',
  url: 'https://hooks.example.test/existing',
  event_types: ['match.finished'],
  description: 'Abonnement existant',
  enabled: true,
  consecutive_failures: 0,
  disabled_at: null,
  last_delivery_at: null,
  last_error: null,
  created_at: '2026-09-01T00:00:00.000Z',
};

test.describe('Admin — Webhooks sortants', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(ADMIN_EMAIL);
    await createTestStaff(ADMIN_EMAIL, STAFF_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(ADMIN_EMAIL);
  });

  test('liste les abonnements et en crée un', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockActiveTenant(page);
    await mockJson(page, '/api/admin/webhooks', {
      subscriptions: [EXISTING],
      availableEvents: ['match.finished', 'team.registered'],
    });
    const create = await captureJson(page, '/api/admin/webhooks', {
      secret: 'whsec_e2e_secret',
      subscription: {
        ...EXISTING,
        id: 'new',
        url: 'https://hooks.example.test/new',
      },
    });

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/webhooks');
    await expect(
      page.getByRole('heading', { name: 'Webhooks sortants', level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);

    await expect(page.getByTestId(`webhook-row-${EXISTING.id}`)).toContainText(
      EXISTING.url
    );

    // Sans événement coché : refus côté écran, rien ne part.
    await page
      .getByTestId('webhook-url-input')
      .fill('https://hooks.example.test/new');
    await page.getByTestId('webhook-create-btn').click();
    expect(create.requests).toHaveLength(0);

    await page.getByTestId('webhook-event-team.registered').click();
    await page.getByTestId('webhook-create-btn').click();

    await expect.poll(() => create.requests.length).toBe(1);
    expect(create.requests[0].body).toMatchObject({
      url: 'https://hooks.example.test/new',
      event_types: ['team.registered'],
    });
    await expect(page.getByTestId('api-token-reveal-input')).toHaveValue(
      'whsec_e2e_secret'
    );
  });
});
