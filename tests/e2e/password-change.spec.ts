import { test, expect } from '@playwright/test';
import {
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const password = 'TestPassw0rd!';
const newPassword = 'NewTestPassw0rd!';
const STAFF_EMAIL = `hirtzvincent+pwdchangestaff@gmail.com`;

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function cleanupUsers() {
  await deleteTestStaff(STAFF_EMAIL);
}

test.describe('Password change feature', () => {
  test.beforeAll(async () => {
    await cleanupUsers();
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  // Note: Player password change tests are removed because the /register page
  // no longer has a login form - players should use /admin/login
  // The password change feature is tested via the staff tests below

  test.describe('Staff password change', () => {
    test.beforeAll(async () => {
      await createTestStaff(STAFF_EMAIL, password, 'manager');
    });

    test('displays password change form on /admin page', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as staff
      await page.goto('/admin/login');
      await page.fill('input#email', STAFF_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      // Wait for redirect to admin
      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

      // Check password change form is present (use heading to avoid ambiguity)
      await expect(page.getByRole('heading', { name: 'Changer mon mot de passe' })).toBeVisible();
      await expect(page.getByPlaceholder('••••••••').first()).toBeVisible();
    });

    test('shows error when passwords do not match', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as staff
      await page.goto('/admin/login');
      await page.fill('input#email', STAFF_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

      // Find the password change section
      const passwordSection = page.locator('section').filter({ hasText: 'Changer mon mot de passe' });

      // Fill in mismatched passwords
      await passwordSection.getByPlaceholder('••••••••').first().fill('Password123!');
      await passwordSection.getByPlaceholder('••••••••').last().fill('DifferentPassword123!');

      // Submit
      await passwordSection.getByRole('button', { name: 'Changer mon mot de passe' }).click();

      // Should show error message
      await expect(
        page.getByText(/ne correspondent pas/i)
      ).toBeVisible({ timeout: 5000 });
    });

    test('shows error when password is too short', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as staff
      await page.goto('/admin/login');
      await page.fill('input#email', STAFF_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

      // Find the password change section
      const passwordSection = page.locator('section').filter({ hasText: 'Changer mon mot de passe' });

      // Fill in short password
      await passwordSection.getByPlaceholder('••••••••').first().fill('short');
      await passwordSection.getByPlaceholder('••••••••').last().fill('short');

      // Submit
      await passwordSection.getByRole('button', { name: 'Changer mon mot de passe' }).click();

      // Should show error message
      await expect(
        page.getByText(/8 caractères/i)
      ).toBeVisible({ timeout: 5000 });
    });

    test('changes password successfully', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as staff
      await page.goto('/admin/login');
      await page.fill('input#email', STAFF_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

      // Find the password change section
      const passwordSection = page.locator('section').filter({ hasText: 'Changer mon mot de passe' });

      // Fill in matching passwords
      await passwordSection.getByPlaceholder('••••••••').first().fill(newPassword);
      await passwordSection.getByPlaceholder('••••••••').last().fill(newPassword);

      // Submit
      await passwordSection.getByRole('button', { name: 'Changer mon mot de passe' }).click();

      // Should show success message
      await expect(
        page.getByText(/modifié avec succès/i)
      ).toBeVisible({ timeout: 10000 });
    });
  });
});
