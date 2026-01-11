import { test, expect } from '@playwright/test';
import {
  createTestStaff,
  deleteTestUser,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const password = 'TestPassw0rd!';
const uniqueEmail = `hirtzvincent+uniqueemail@gmail.com`;
const STAFF_LOGIN_EMAIL = `hirtzvincent+authstaff@gmail.com`;

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function cleanupUsers() {
  await deleteTestUser(uniqueEmail);
  await deleteTestStaff(STAFF_LOGIN_EMAIL);
}

test.describe.serial('Auth flow', () => {
  test.beforeAll(async () => {
    await cleanupUsers();
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('Inscription via /register', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

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
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Create staff with proper role
    await createTestStaff(STAFF_LOGIN_EMAIL, password, 'manager');

    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_LOGIN_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');

    // Wait for redirect to admin
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/admin/);

    // Verify we're on an admin page (not login)
    expect(page.url()).not.toContain('/admin/login');

    // Déconnexion
    await page.goto('/admin/logout');
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/admin\/login/);
  });

  test('Connexion avec mauvais mot de passe échoue', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_LOGIN_EMAIL);
    await page.fill('input#password', 'wrongpassword123');
    await page.click('button[type="submit"]');

    // Should show error and stay on login page
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/admin/login');
  });

  test('Session persiste après refresh', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login
    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_LOGIN_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Navigate to admin page
    await page.goto('/admin');
    await page.waitForTimeout(1000);

    // Should still be on admin (not redirected to login)
    const url = page.url();
    expect(url).toContain('/admin');
    expect(url).not.toContain('/admin/login');

    // Refresh the page
    await page.reload();
    await page.waitForTimeout(2000);

    // Should still be logged in
    const urlAfterRefresh = page.url();
    expect(urlAfterRefresh).not.toContain('/admin/login');
  });
});
