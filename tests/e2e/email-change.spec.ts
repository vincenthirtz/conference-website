import { test, expect } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const password = 'TestPassw0rd!';
const STAFF_EMAIL = `hirtzvincent+emailchangestaff@gmail.com`;
const NEW_EMAIL_SUFFIX = '+newemail';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function cleanupUsers() {
  await deleteTestStaff(STAFF_EMAIL);
  await deleteTestStaff(STAFF_EMAIL.replace('@', `${NEW_EMAIL_SUFFIX}@`));
}

test.describe('Email change feature', () => {
  test.beforeAll(async () => {
    await cleanupUsers();
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  // Note: Player email change tests are removed because the /register page
  // no longer has a login form - players should use /login
  // The email change feature for players is tested via the staff tests below

  // Le formulaire n'est plus sur la page /admin : il vit dans la modale
  // « Mon profil » de l'AdminShell (components/admin/profile/ProfileModal.tsx),
  // onglet « Sécurité ».
  async function openEmailSection(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', password);
    await page.click('#main-content button[type="submit"]');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });

    await page.getByRole('button', { name: 'Ouvrir mon profil' }).click();
    await page.getByRole('tab', { name: 'Sécurité' }).click();
    return page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Changer mon email' }),
    });
  }

  test.describe('Staff email change', () => {
    test.beforeAll(async () => {
      await createTestStaff(STAFF_EMAIL, password, 'admin');
    });

    test('displays email change form in the profile modal', async ({
      page,
    }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      const section = await openEmailSection(page);
      await expect(section).toBeVisible();
      await expect(section.getByPlaceholder('nouveau@email.com')).toBeVisible();
    });

    test('shows validation when submitting same email', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      const section = await openEmailSection(page);
      // Le profil (et donc l'email courant) se charge à l'ouverture.
      const submitButton = section.getByRole('button', {
        name: 'Changer mon email',
      });
      await section.getByPlaceholder('nouveau@email.com').fill(STAFF_EMAIL);
      // Bouton désactivé tant que l'adresse est l'adresse actuelle.
      await expect(submitButton).toBeDisabled();
    });

    test('submits email change request successfully', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      const section = await openEmailSection(page);
      const newEmail = STAFF_EMAIL.replace('@', `${NEW_EMAIL_SUFFIX}@`);
      await section.getByPlaceholder('nouveau@email.com').fill(newEmail);
      const submitButton = section.getByRole('button', {
        name: 'Changer mon email',
      });
      await expect(submitButton).toBeEnabled();
      await submitButton.click();

      await expect(page.getByText(/email de confirmation/i)).toBeVisible({
        timeout: 10000,
      });
    });
  });
});
