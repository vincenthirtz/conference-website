import { test, expect } from '@playwright/test';
import {
  createTestPlayer,
  createTestStaff,
  deleteTestUser,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const password = 'TestPassw0rd!';
const newPassword = 'NewTestPassw0rd!';
const PLAYER_EMAIL = `hirtzvincent+pwdchangeplayer@gmail.com`;
const STAFF_EMAIL = `hirtzvincent+pwdchangestaff@gmail.com`;

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function cleanupUsers() {
  await deleteTestUser(PLAYER_EMAIL);
  await deleteTestStaff(STAFF_EMAIL);
}

test.describe('Password change feature', () => {
  test.beforeAll(async () => {
    await cleanupUsers();
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test.describe('Player password change', () => {
    test.beforeAll(async () => {
      await createTestPlayer(PLAYER_EMAIL, password);
    });

    test('displays password change form on /player page', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as player via /register (login form)
      await page.goto('/register?mode=login');
      await page.fill('input#email', PLAYER_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      // Wait for redirect to /player
      await page.waitForURL(/\/player/, { timeout: 10000 });

      // Check password change form is present
      await expect(page.getByText('Changer de mot de passe')).toBeVisible();
      await expect(page.getByPlaceholder('Nouveau mot de passe')).toBeVisible();
      await expect(page.getByPlaceholder('Confirmer le mot de passe')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Changer mon mot de passe' })
      ).toBeVisible();
    });

    test('shows error when passwords do not match', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as player
      await page.goto('/register?mode=login');
      await page.fill('input#email', PLAYER_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/player/, { timeout: 10000 });

      // Fill in mismatched passwords
      await page.getByPlaceholder('Nouveau mot de passe').fill('Password123!');
      await page.getByPlaceholder('Confirmer le mot de passe').fill('DifferentPassword123!');

      // Submit
      await page.getByRole('button', { name: 'Changer mon mot de passe' }).click();

      // Should show error message
      await expect(
        page.getByText(/ne correspondent pas/i)
      ).toBeVisible({ timeout: 5000 });
    });

    test('shows error when password is too short', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as player
      await page.goto('/register?mode=login');
      await page.fill('input#email', PLAYER_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/player/, { timeout: 10000 });

      // Fill in short password
      await page.getByPlaceholder('Nouveau mot de passe').fill('short');
      await page.getByPlaceholder('Confirmer le mot de passe').fill('short');

      // Submit
      await page.getByRole('button', { name: 'Changer mon mot de passe' }).click();

      // Should show error message
      await expect(
        page.getByText(/8 caractères/i)
      ).toBeVisible({ timeout: 5000 });
    });

    test('changes password successfully', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as player
      await page.goto('/register?mode=login');
      await page.fill('input#email', PLAYER_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/player/, { timeout: 10000 });

      // Fill in matching passwords
      await page.getByPlaceholder('Nouveau mot de passe').fill(newPassword);
      await page.getByPlaceholder('Confirmer le mot de passe').fill(newPassword);

      // Submit
      await page.getByRole('button', { name: 'Changer mon mot de passe' }).click();

      // Should show success message
      await expect(
        page.getByText(/modifié avec succès/i)
      ).toBeVisible({ timeout: 10000 });
    });
  });

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

      // Check password change form is present
      await expect(page.getByText('Changer mon mot de passe')).toBeVisible();
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
