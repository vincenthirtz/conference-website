// tests/e2e/admin-notifications.spec.ts
//
// E2E pour le panneau notifications du hub /admin/communications?tab=notifications
// (PWA Web Push UI).
//
// Couvre :
//   - Auth gate : sans session, redirige vers /login ou /403
//   - Avec une session staff `admin`, la page s'affiche avec ses 2 sections
//     (status + prefs) et le bouton de test
//   - Toggle d'un event_type → PUT déclenché → reload → toggle persisté
//
// Le flow opt-in complet (Notification.requestPermission + pushManager) n'est
// PAS testé ici : les browsers Playwright headless ne supportent pas tous le
// PushManager de manière fiable, et la permission est gated derrière une
// gesture utilisateur dans Firefox. On le couvre côté unit test si nécessaire.

import { test, expect, type Page } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const TEST_PASSWORD = 'TestPassw0rd!';
const ADMIN_EMAIL = 'hirtzvincent+e2e-notifications@gmail.com';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input#email', ADMIN_EMAIL);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

test.describe('Admin notifications (sans auth)', () => {
  test('GET /admin/communications?tab=notifications redirige vers login ou 403', async ({
    page,
  }) => {
    await page.goto('/admin/communications?tab=notifications');
    await page.waitForTimeout(1000);

    const url = page.url();
    const redirectedToLogin = url.includes('/login');
    const redirectedTo403 = url.includes('/403');

    expect(
      redirectedToLogin || redirectedTo403,
      `/admin/communications?tab=notifications devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });
});

test.describe.serial('Admin notifications page (staff session)', () => {
  test.beforeAll(async () => {
    if (!skipIfNoServiceRole()) {
      await deleteTestStaff(ADMIN_EMAIL);
      await createTestStaff(ADMIN_EMAIL, TEST_PASSWORD, 'admin');
    }
  });

  test.afterAll(async () => {
    if (!skipIfNoServiceRole()) {
      await deleteTestStaff(ADMIN_EMAIL);
    }
  });

  test('La page affiche les sections État et Préférences', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/communications?tab=notifications');

    // Heading principal du hub Communication (les notifications sont désormais
    // dans un panneau à onglet, plus une page dédiée avec son propre h1).
    await expect(
      page.getByRole('heading', { name: /Communication/i, level: 1 })
    ).toBeVisible({ timeout: 10000 });

    // Section "État de ce device"
    await expect(
      page.getByTestId('notifications-status-section')
    ).toBeVisible();
    await expect(page.getByTestId('notifications-status-pill')).toBeVisible();
    await expect(page.getByTestId('notifications-test-btn')).toBeVisible();

    // Section "Préférences"
    await expect(page.getByTestId('notifications-prefs-section')).toBeVisible();
    await expect(page.getByTestId('notifications-save-btn')).toBeVisible();

    // Au moins quelques toggles attendus
    await expect(page.getByTestId('pref-toggle-match.starting')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByTestId('pref-toggle-scrim.invitation')
    ).toBeVisible();
    await expect(
      page.getByTestId('pref-toggle-registration.new')
    ).toBeVisible();
    await expect(page.getByTestId('pref-toggle-news.published')).toBeVisible();
  });

  test('Toggle puis enregistre une pref → persiste après reload', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/communications?tab=notifications');

    // Attend le chargement des prefs.
    const toggle = page.getByTestId('pref-toggle-news.published');
    await expect(toggle).toBeVisible({ timeout: 10000 });

    const checkbox = toggle.locator('input[type="checkbox"]');
    // Par défaut, prefs absentes = enabled true.
    await expect(checkbox).toBeChecked();

    // Click sur le label (clic input direct bloqué par le sr-only + peer).
    await toggle.click();
    await expect(checkbox).not.toBeChecked();

    // Save (intercepte le PUT pour valider que la requête part).
    const putRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/api/admin/notifications/prefs') &&
        req.method() === 'PUT'
    );

    await page.getByTestId('notifications-save-btn').click();
    const req = await putRequest;
    const body = JSON.parse(req.postData() || '{}');
    expect(body.prefs).toBeTruthy();
    expect(
      body.prefs.some(
        (p: { event_type: string; enabled: boolean }) =>
          p.event_type === 'news.published' && p.enabled === false
      )
    ).toBeTruthy();

    // Reload → la pref doit rester décochée.
    await page.reload();
    const toggleAfter = page.getByTestId('pref-toggle-news.published');
    await expect(toggleAfter).toBeVisible({ timeout: 10000 });
    const checkboxAfter = toggleAfter.locator('input[type="checkbox"]');
    await expect(checkboxAfter).not.toBeChecked();

    // Cleanup : remet la pref à true et save (la table est partagée entre
    // les runs ; on évite de polluer pour les tests suivants).
    await toggleAfter.click();
    await expect(checkboxAfter).toBeChecked();
    await page.getByTestId('notifications-save-btn').click();
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/admin/notifications/prefs') &&
        resp.request().method() === 'PUT' &&
        resp.ok(),
      { timeout: 10000 }
    );
  });
});
