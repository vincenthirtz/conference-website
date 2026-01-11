import { test, expect } from '@playwright/test';
import {
  createTestStaff,
  createTestPlayer,
  deleteTestUser,
  deleteTestStaff,
  supabaseTestClient,
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

test.describe('Admin users management', () => {
  test.beforeAll(async () => {
    await cleanupUsers();
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('Admin can access /admin/users/manage page', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Create admin user
    await createTestStaff(ADMIN_EMAIL, TEST_PASSWORD, 'admin');

    // Login as admin
    await page.goto('/admin/login');
    await page.fill('input#email', ADMIN_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Navigate to users management page
    await page.goto('/admin/users/manage');
    await page.waitForTimeout(1000);

    // Should be on users manage page
    expect(page.url()).toContain('/admin/users/manage');

    // Should see the page title
    await expect(page.getByText('Gestion des inscrits')).toBeVisible({
      timeout: 10000,
    });

    // Should see table headers
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Nom' })).toBeVisible();
  });

  test('Admin can search users', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Create a target user to search for
    await createTestPlayer(TARGET_USER_EMAIL, TEST_PASSWORD);

    // Login as admin
    await page.goto('/admin/login');
    await page.fill('input#email', ADMIN_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Navigate to users management page
    await page.goto('/admin/users/manage');
    await page.waitForTimeout(1000);

    // Search for the target user
    await page.fill('input[placeholder*="Recherche"]', 'targetuser');
    await page.click('button:has-text("Recharger")');

    await page.waitForTimeout(2000);

    // Should find the user
    await expect(page.getByText(TARGET_USER_EMAIL)).toBeVisible({
      timeout: 10000,
    });
  });

  test('Admin can change user role', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login as admin
    await page.goto('/admin/login');
    await page.fill('input#email', ADMIN_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Navigate to users management page
    await page.goto('/admin/users/manage');
    await page.waitForTimeout(1000);

    // Search for target user
    await page.fill('input[placeholder*="Recherche"]', 'targetuser');
    await page.click('button:has-text("Recharger")');
    await page.waitForTimeout(2000);

    // Find the row with the target user and change their role
    const userRow = page.locator('tr', { has: page.getByText(TARGET_USER_EMAIL) });
    const roleSelect = userRow.locator('select').first();

    // Change role to caster
    await roleSelect.selectOption('caster');

    // Wait for success message
    await expect(page.getByText('mis à jour')).toBeVisible({
      timeout: 10000,
    });

    // Verify in database that staff entry was created
    if (supabaseTestClient) {
      const { data: users } = await supabaseTestClient.auth.admin.listUsers({
        page: 1,
        perPage: 100,
      });
      const targetUser = users?.users?.find(
        (u) => u.email?.toLowerCase() === TARGET_USER_EMAIL.toLowerCase()
      );

      if (targetUser) {
        const { data: staffEntry } = await supabaseTestClient
          .from('staff')
          .select('role')
          .eq('auth_user_id', targetUser.id)
          .maybeSingle();

        expect(staffEntry?.role).toBe('caster');
      }
    }
  });

  test('Changing role to member removes staff entry', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login as admin
    await page.goto('/admin/login');
    await page.fill('input#email', ADMIN_EMAIL);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Navigate to users management page
    await page.goto('/admin/users/manage');
    await page.waitForTimeout(1000);

    // Search for target user
    await page.fill('input[placeholder*="Recherche"]', 'targetuser');
    await page.click('button:has-text("Recharger")');
    await page.waitForTimeout(2000);

    // Find the row with the target user and change their role back to member
    const userRow = page.locator('tr', { has: page.getByText(TARGET_USER_EMAIL) });
    const roleSelect = userRow.locator('select').first();

    // Change role to member
    await roleSelect.selectOption('member');

    // Wait for success message
    await expect(page.getByText('mis à jour')).toBeVisible({
      timeout: 10000,
    });

    // Verify in database that staff entry was removed
    if (supabaseTestClient) {
      const { data: users } = await supabaseTestClient.auth.admin.listUsers({
        page: 1,
        perPage: 100,
      });
      const targetUser = users?.users?.find(
        (u) => u.email?.toLowerCase() === TARGET_USER_EMAIL.toLowerCase()
      );

      if (targetUser) {
        const { data: staffEntry } = await supabaseTestClient
          .from('staff')
          .select('role')
          .eq('auth_user_id', targetUser.id)
          .maybeSingle();

        expect(staffEntry).toBeNull();
      }
    }
  });
});

test.describe('Admin users API', () => {
  test('GET /api/admin/users/manage returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/admin/users/manage');
    expect(response.status()).toBe(401);
  });

  test('PATCH /api/admin/users/manage returns 401 without auth', async ({ request }) => {
    const response = await request.patch('/api/admin/users/manage', {
      data: { userId: 'test', role: 'member' },
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/admin/users/manage returns 401 with invalid token', async ({ request }) => {
    const response = await request.get('/api/admin/users/manage', {
      headers: {
        Authorization: 'Bearer invalid_token_12345',
      },
    });
    expect(response.status()).toBe(401);
  });
});
