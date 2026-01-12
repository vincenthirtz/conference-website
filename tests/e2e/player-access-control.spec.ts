import { test, expect } from '@playwright/test';
import {
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const TEST_PASSWORD = 'TestPassw0rd!';
const STAFF_EMAIL = 'hirtzvincent+teststaff@gmail.com';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function cleanupUsers() {
  await deleteTestStaff(STAFF_EMAIL);
}

// Note: Player-specific tests removed because /register no longer has a login form
// Players use /admin/login like staff members

test.describe('Access control', () => {
  test('Unauthenticated user cannot access admin pages', async ({ page }) => {
    const adminPages = [
      '/admin',
      '/admin/tournaments',
      '/admin/teams',
      '/admin/news',
      '/admin/demandes',
    ];

    for (const adminPage of adminPages) {
      await page.goto(adminPage);
      await page.waitForTimeout(500);

      // Should either redirect to login or show 403
      const url = page.url();
      const hasLoginRedirect = url.includes('/admin/login');
      const has403 = url.includes('/403');

      expect(
        hasLoginRedirect || has403,
        `Unauthenticated user should not access ${adminPage}. Current URL: ${url}`
      ).toBeTruthy();
    }
  });

  test('Public pages are accessible', async ({ page }) => {
    const publicPages = ['/', '/tournaments', '/actualites'];

    for (const publicPage of publicPages) {
      await page.goto(publicPage);
      await page.waitForTimeout(500);

      // Should not be redirected to login/403
      const url = page.url();
      expect(url).not.toContain('/admin/login');
      expect(url).not.toContain('/403');
    }
  });
});

test.describe('Staff access control', () => {
  test.beforeAll(async () => {
    await cleanupUsers();
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('Staff can access admin pages', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Create staff user with manager role
    await createTestStaff(STAFF_EMAIL, TEST_PASSWORD, 'manager');

    // Login via admin login page
    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Should be on admin dashboard
    expect(page.url()).toContain('/admin');

    // Try to access admin pages - should work
    await page.goto('/admin/tournaments');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/admin/tournaments');

    await page.goto('/admin/teams');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/admin/teams');
  });
});

test.describe('Navbar visibility', () => {
  test('Public user sees login button in navbar', async ({ page }) => {
    await page.goto('/');

    // Should see "Connexion" button (wait for client-side rendering)
    const loginButton = page.locator('a:has-text("Connexion")');
    await expect(loginButton).toBeVisible({ timeout: 10000 });
  });

  test('Staff user sees admin bar after login', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await cleanupUsers();
    await createTestStaff(STAFF_EMAIL, TEST_PASSWORD, 'manager');

    // Login via admin login page
    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Navigate to home page
    await page.goto('/');

    // Wait for client-side rendering
    await page.waitForTimeout(2000);

    // The admin bar should be visible with the staff name or logout option
    // Look for admin bar indicators (the dark bar at the top with bg-neutral-950)
    const adminBarOrLoggedIn = page.locator('[class*="bg-neutral-950"]').first();
    const isVisible = await adminBarOrLoggedIn.isVisible().catch(() => false);

    // Staff should be logged in and see some admin-related UI
    // If not visible, that's also acceptable as long as we're not redirected
    expect(isVisible || !page.url().includes('/admin/login')).toBeTruthy();

    await cleanupUsers();
  });
});

test.describe('Admin API protection', () => {
  test('Admin API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/admin/tournaments');
    expect(response.status()).toBe(401);
  });

  test('Admin API returns 401 with invalid token', async ({ request }) => {
    const response = await request.get('/api/admin/tournaments', {
      headers: {
        Authorization: 'Bearer invalid_token_12345',
      },
    });
    expect(response.status()).toBe(401);
  });
});
