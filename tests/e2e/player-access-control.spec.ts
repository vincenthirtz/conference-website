import { test, expect } from '@playwright/test';
import {
  createTestPlayer,
  createTestStaff,
  deleteTestUser,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const TEST_PASSWORD = 'TestPassw0rd!';
const PLAYER_EMAIL = 'hirtzvincent+testplayer@gmail.com';
const STAFF_EMAIL = 'hirtzvincent+teststaff@gmail.com';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function cleanupUsers() {
  await deleteTestUser(PLAYER_EMAIL);
  await deleteTestStaff(STAFF_EMAIL);
}

test.describe('Player access control', () => {
  test.beforeAll(async () => {
    await cleanupUsers();
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('Player cannot access admin pages - redirected to login or 403', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Create player user
    await createTestPlayer(PLAYER_EMAIL, TEST_PASSWORD);

    // Login as player via /register login form
    await page.goto('/register');

    // Fill login form (the register page has a login section)
    await page.click('text=Se connecter');
    await page.fill('input#loginEmail', PLAYER_EMAIL);
    await page.fill('input#loginPassword', TEST_PASSWORD);
    await page.click('button:has-text("Connexion")');

    // Wait for redirect to player dashboard
    await page.waitForTimeout(2000);

    // Try to access admin pages - should be blocked
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
      const pageContent = await page.content();
      const shows403Content =
        pageContent.includes('403') || pageContent.includes('non autorise');

      expect(
        hasLoginRedirect || has403 || shows403Content,
        `Player should not access ${adminPage}. Current URL: ${url}`
      ).toBeTruthy();
    }
  });

  test('Player can access /player dashboard', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login as player
    await page.goto('/register');
    await page.click('text=Se connecter');
    await page.fill('input#loginEmail', PLAYER_EMAIL);
    await page.fill('input#loginPassword', TEST_PASSWORD);
    await page.click('button:has-text("Connexion")');

    await page.waitForTimeout(2000);

    // Navigate to player dashboard
    await page.goto('/player');
    await page.waitForTimeout(1000);

    // Should be on player page (not redirected)
    expect(page.url()).toContain('/player');

    // Should see player dashboard content
    await expect(
      page.getByText(/bienvenue|mon espace|profil/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('Player can access /player/request-captain', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login as player
    await page.goto('/register');
    await page.click('text=Se connecter');
    await page.fill('input#loginEmail', PLAYER_EMAIL);
    await page.fill('input#loginPassword', TEST_PASSWORD);
    await page.click('button:has-text("Connexion")');

    await page.waitForTimeout(2000);

    // Navigate to request captain page
    await page.goto('/player/request-captain');
    await page.waitForTimeout(1000);

    // Should be on request-captain page
    expect(page.url()).toContain('/player/request-captain');

    // Should see captain request form
    await expect(
      page.getByText(/devenir capitaine|creer une equipe/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('Player can access public pages', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    const publicPages = ['/', '/tournaments', '/news'];

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
    await page.waitForTimeout(1000);

    // Should see "Connexion" button (not "Connecte")
    const loginButton = page.locator('a:has-text("Connexion")');
    await expect(loginButton).toBeVisible({ timeout: 5000 });
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
    await page.waitForTimeout(1000);

    // Should see staff indicator (green dot, "Connecte", or staff name)
    const staffIndicators = [
      page.locator('text=Connecte').first(),
      page.locator('.bg-emerald-400').first(), // green indicator dot
      page.locator('text=Deconnexion').first(),
    ];

    let found = false;
    for (const indicator of staffIndicators) {
      try {
        await expect(indicator).toBeVisible({ timeout: 2000 });
        found = true;
        break;
      } catch {
        // Try next indicator
      }
    }

    expect(found).toBeTruthy();

    await cleanupUsers();
  });

  test('Player user does not see admin bar', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await cleanupUsers();
    await createTestPlayer(PLAYER_EMAIL, TEST_PASSWORD);

    // Login as player
    await page.goto('/register');
    await page.click('text=Se connecter');
    await page.fill('input#loginEmail', PLAYER_EMAIL);
    await page.fill('input#loginPassword', TEST_PASSWORD);
    await page.click('button:has-text("Connexion")');

    await page.waitForTimeout(2000);

    // Navigate to home page
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Should NOT see admin-specific elements
    const adminBar = page.locator('text=Deconnexion');

    // Admin bar should not be visible for players
    await expect(adminBar).not.toBeVisible({ timeout: 2000 });

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
