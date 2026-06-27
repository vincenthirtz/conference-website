// E2E — pages/player/profile.tsx ("Mon profil")
//
// Sections: résumé compte / modifier profil (PATCH /api/player/update-profile)
// / changer email / changer mot de passe / mes données (export + delete).
//
// Auth = real player login; only /api/player/* data endpoints are mocked.
// Email/password changes go straight to Supabase auth (external) — we keep
// those light and assert the UI flow, not the real Supabase call, consistent
// with password-change.spec.ts / auth.spec.ts.
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+playerprofile@gmail.com`;

test.describe('Player profile page', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('renders the account summary and all sections', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginPlayer(page, PLAYER_EMAIL, '/player/profile');

    await expect(
      page.getByRole('heading', { name: 'Mon profil', level: 1 })
    ).toBeVisible({ timeout: 10000 });

    // Account summary shows the email.
    await expect(page.getByText(PLAYER_EMAIL)).toBeVisible();

    // The 4 management sections.
    for (const heading of [
      'Modifier mon profil',
      'Changer mon email',
      'Changer mon mot de passe',
      'Mes données',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('editing display_name + battle_tag issues a PATCH and shows success', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Capture the PATCH payload and fulfill it ourselves.
    let patchBody: unknown = null;
    await page.route('**/api/player/update-profile', async (route) => {
      patchBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/profile');

    const section = page
      .locator('section')
      .filter({ hasText: 'Modifier mon profil' });

    await section.getByLabel('Nom affiche').fill('Nouveau Pseudo');
    await section.getByLabel('BattleTag').fill('Nouveau#4242');
    await section
      .getByLabel('Avatar (URL)')
      .fill('https://example.com/avatar.png');
    await section.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText(/Profil mis a jour/i)).toBeVisible({
      timeout: 10000,
    });

    expect(patchBody).toMatchObject({
      display_name: 'Nouveau Pseudo',
      battle_tag: 'Nouveau#4242',
      avatar_url: 'https://example.com/avatar.png',
    });
  });

  test('email change shows validation / pending-confirmation UX', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginPlayer(page, PLAYER_EMAIL, '/player/profile');

    const section = page
      .locator('section')
      .filter({ hasText: 'Changer mon email' });

    // Submit button stays disabled while the field is empty.
    await expect(
      section.getByRole('button', { name: 'Changer mon email' })
    ).toBeDisabled();

    await section
      .getByLabel('Nouvel email')
      .fill('nouvelle+adresse@example.com');
    await expect(
      section.getByRole('button', { name: 'Changer mon email' })
    ).toBeEnabled();
    await section.getByRole('button', { name: 'Changer mon email' }).click();

    // Either a confirmation-email notice (success) or a Supabase error — both
    // prove the flow ran. We don't assert the external Supabase outcome.
    await expect(
      section.getByText(/confirmation|envoyé|Erreur/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('password change validates mismatched passwords client-side', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginPlayer(page, PLAYER_EMAIL, '/player/profile');

    const section = page
      .locator('section')
      .filter({ hasText: 'Changer mon mot de passe' });

    await section.getByLabel('Nouveau mot de passe').fill('Password123!');
    await section.getByLabel('Confirmer le mot de passe').fill('Different123!');
    await section
      .getByRole('button', { name: 'Changer mon mot de passe' })
      .click();

    await expect(page.getByText(/ne correspondent pas/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('"Mes données" export reveals a confirmation step', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Mock the export so no real download is attempted.
    await mockApiJson(page, '/api/player/data-export', {
      exported_at: new Date().toISOString(),
      account: { email: PLAYER_EMAIL },
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/profile');

    const section = page.locator('section').filter({ hasText: 'Mes données' });

    await section
      .getByRole('button', { name: 'Télécharger mes données' })
      .click();
    await expect(section.getByText('mes-donnees.json')).toBeVisible();
    await expect(
      section.getByRole('button', { name: 'Confirmer le téléchargement' })
    ).toBeVisible();
  });

  test('"Mes données" delete reveals an irreversible confirm step', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginPlayer(page, PLAYER_EMAIL, '/player/profile');

    const section = page.locator('section').filter({ hasText: 'Mes données' });

    await section.getByRole('button', { name: 'Supprimer mon compte' }).click();

    await expect(section.getByText(/irréversible/i)).toBeVisible();
    await expect(
      section.getByRole('button', { name: 'Confirmer la suppression' })
    ).toBeVisible();
    // Cancel — we must not actually delete the shared test user here.
    await section.getByRole('button', { name: 'Annuler' }).click();
    await expect(
      section.getByRole('button', { name: 'Supprimer mon compte' })
    ).toBeVisible();
  });
});
