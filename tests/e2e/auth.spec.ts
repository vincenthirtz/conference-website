import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from '../utils/supabaseTestClient';

const password = 'TestPassw0rd!';
const uniqueEmail = `hirtzvincent+uniqueemail@gmail.com`;

const STAFF_LOGIN_EMAIL = `hirtzvincent+staff@gmail.com`;

async function createStaff() {
  return createTestUser(STAFF_LOGIN_EMAIL, password);
}

async function cleanupUsers() {
  await deleteTestUser(uniqueEmail);
  await deleteTestUser(STAFF_LOGIN_EMAIL);
}

test.describe.serial('Auth flow', () => {
  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('Inscription via /register', async ({ page }) => {
    test.skip(
      !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
      'Supabase service role manquant'
    );

    await page.goto('/register');
    await page.fill('input#displayName', 'Test User');
    await page.fill('input#email', uniqueEmail);
    await page.fill('input#password', password);
    await page.fill('input#confirm', password);
    await page.click('button[type="submit"]');
    await expect(page.getByText(/Compte créé/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test('Connexion / Déconnexion staff', async ({ page }) => {
    test.skip(
      !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
      'Supabase service role manquant'
    );

    await createStaff();

    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_LOGIN_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/admin/);

    // Déconnexion
    await page.goto('/admin/logout');
    await expect(page).toHaveURL(/admin\/login/);
  });
});
