import { test, expect } from '@playwright/test';
import {
  createTestStaff,
  createTestPlayer,
  deleteTestUser,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const TEST_PASSWORD = 'TestPassw0rd!';
const ADMIN_EMAIL = 'hirtzvincent+testadmin@gmail.com';
const TARGET_USER_EMAIL = 'hirtzvincent+targetuser@gmail.com';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function cleanupUsers() {
  await deleteTestStaff(ADMIN_EMAIL);
  await deleteTestUser(TARGET_USER_EMAIL);
}

test.describe.serial('Admin users management', () => {
  test.beforeAll(async () => {
    await cleanupUsers();
    // Pre-create admin user for all tests
    await createTestStaff(ADMIN_EMAIL, TEST_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('Admin can access /admin/users/manage page', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#email', ADMIN_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect to admin
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

    // Navigate to users management page
    await page.goto('/admin/users/manage');

    // Should be on users manage page
    await page.waitForURL(/\/admin\/users\/manage/, { timeout: 10000 });

    // Should see the page title
    await expect(
      page.getByRole('heading', { name: 'Gestion des inscrits' })
    ).toBeVisible({
      timeout: 15000,
    });

    // Should see user search form and data loaded
    await expect(
      page.getByPlaceholder('Email, nom ou BattleTag...')
    ).toBeVisible({ timeout: 10000 });
    // Should have at least one user visible (the test admin we just logged in with)
    await expect(page.getByText(ADMIN_EMAIL)).toBeVisible({ timeout: 10000 });
  });

  test('Admin can search users', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Create a target user to search for
    await createTestPlayer(TARGET_USER_EMAIL, TEST_PASSWORD);

    // Login as admin
    await page.goto('/login');
    await page.fill('input#email', ADMIN_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

    // Navigate to users management page
    await page.goto('/admin/users/manage');
    await page.waitForURL(/\/admin\/users\/manage/, { timeout: 10000 });

    // Wait for page to load
    await expect(page.getByText('Gestion des inscrits')).toBeVisible({
      timeout: 15000,
    });

    // Search for the target user using the actual placeholder
    const searchInput = page.getByPlaceholder('Email, nom ou BattleTag...');
    await searchInput.fill('targetuser');

    // Click search button (there's a form submit or search button)
    await searchInput.press('Enter');

    // Should find the user
    await expect(page.getByText(TARGET_USER_EMAIL)).toBeVisible({
      timeout: 15000,
    });
  });

  test('Admin can change user role', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#email', ADMIN_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

    // Navigate to users management page
    await page.goto('/admin/users/manage');
    await page.waitForURL(/\/admin\/users\/manage/, { timeout: 10000 });

    // Wait for page to load
    await expect(page.getByText('Gestion des inscrits')).toBeVisible({
      timeout: 15000,
    });

    // Search for target user using the actual placeholder
    const searchInput = page.getByPlaceholder('Email, nom ou BattleTag...');
    await searchInput.fill('targetuser');
    // Click the search button to filter
    await page.getByRole('button', { name: 'Rechercher' }).click();

    // Wait for search results to update - should show only 1 user
    await expect(page.getByText(TARGET_USER_EMAIL)).toBeVisible({
      timeout: 15000,
    });

    // Wait for the list to be filtered (should show "1 utilisateur")
    await expect(page.getByText(/1 utilisateur/)).toBeVisible({
      timeout: 10000,
    });

    // Find the role select for the target user
    // After filtering, there should be only one user card with a combobox
    // Get the combobox that is NOT the filter combobox (which has "Tous les rôles")
    const allComboboxes = page.getByRole('combobox');
    // The second combobox should be the user's role select (first is the filter)
    const roleSelect = allComboboxes.nth(1);

    // Change role to caster
    await roleSelect.selectOption('caster');

    // Wait for success message
    await expect(page.getByText(/mis à jour/i)).toBeVisible({
      timeout: 10000,
    });

    // Verify the UI shows the role badge was updated to "Caster"
    // Look for a span with the role badge class containing "Caster"
    await expect(
      page.locator('span').filter({ hasText: 'Caster' })
    ).toBeVisible({
      timeout: 5000,
    });
  });

  test('Changing role to member removes staff entry', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login as admin
    await page.goto('/login');
    await page.fill('input#email', ADMIN_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

    // Navigate to users management page
    await page.goto('/admin/users/manage');
    await page.waitForURL(/\/admin\/users\/manage/, { timeout: 10000 });

    // Wait for page to load
    await expect(page.getByText('Gestion des inscrits')).toBeVisible({
      timeout: 15000,
    });

    // Search for target user using the actual placeholder
    const searchInput = page.getByPlaceholder('Email, nom ou BattleTag...');
    await searchInput.fill('targetuser');
    // Click the search button to filter
    await page.getByRole('button', { name: 'Rechercher' }).click();

    // Wait for search results to update
    await expect(page.getByText(TARGET_USER_EMAIL)).toBeVisible({
      timeout: 15000,
    });

    // Wait for the list to be filtered
    await expect(page.getByText(/1 utilisateur/)).toBeVisible({
      timeout: 10000,
    });

    // Find the role select for the target user (second combobox after filter)
    const roleSelect = page.getByRole('combobox').nth(1);

    // Change role to member
    await roleSelect.selectOption('member');

    // Wait for success message
    await expect(page.getByText(/mis à jour/i)).toBeVisible({
      timeout: 10000,
    });

    // Verify the role badge shows "Membre" now (look for the span badge, not option)
    await expect(
      page.locator('span').filter({ hasText: 'Membre' })
    ).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('Admin users API', () => {
  test('GET /api/admin/users/manage returns 401 without auth', async ({
    request,
  }) => {
    const response = await request.get('/api/admin/users/manage');
    expect(response.status()).toBe(401);
  });

  test('PATCH /api/admin/users/manage returns 401 without auth', async ({
    request,
  }) => {
    const response = await request.patch('/api/admin/users/manage', {
      data: { userId: 'test', role: 'member' },
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/users/manage returns 401 with invalid token', async ({
    request,
  }) => {
    const response = await request.get('/api/admin/users/manage', {
      headers: {
        Authorization: 'Bearer invalid_token_12345',
      },
    });
    expect(response.status()).toBe(401);
  });
});
