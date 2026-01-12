import { test, expect } from '@playwright/test';
import {
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

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
  // no longer has a login form - players should use /admin/login
  // The email change feature for players is tested via the staff tests below

  test.describe('Staff email change', () => {
    test.beforeAll(async () => {
      await createTestStaff(STAFF_EMAIL, password, 'manager');
    });

    test('displays email change form on /admin page', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as staff
      await page.goto('/admin/login');
      await page.fill('input#email', STAFF_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      // Wait for redirect to admin
      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

      // Check email change form is present (use heading to avoid ambiguity)
      await expect(page.getByRole('heading', { name: 'Changer mon email' })).toBeVisible();
      await expect(page.getByPlaceholder('nouveau@email.com')).toBeVisible();
    });

    test('shows validation when submitting same email', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as staff
      await page.goto('/admin/login');
      await page.fill('input#email', STAFF_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

      // Try to submit with the same email
      const emailInput = page.getByPlaceholder('nouveau@email.com');
      await emailInput.fill(STAFF_EMAIL);

      // Button should be disabled when email is the same
      // Use section filter to find the right form
      const emailSection = page.locator('section').filter({ hasText: 'Changer mon email' });
      const submitButton = emailSection.getByRole('button', { name: 'Changer mon email' });
      await expect(submitButton).toBeDisabled();
    });

    test('submits email change request successfully', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as staff
      await page.goto('/admin/login');
      await page.fill('input#email', STAFF_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });

      // Fill in new email
      const newEmail = STAFF_EMAIL.replace('@', `${NEW_EMAIL_SUFFIX}@`);
      const emailInput = page.getByPlaceholder('nouveau@email.com');
      await emailInput.fill(newEmail);

      // Submit
      const emailSection = page.locator('section').filter({ hasText: 'Changer mon email' });
      const submitButton = emailSection.getByRole('button', { name: 'Changer mon email' });
      await submitButton.click();

      // Wait for success message
      await expect(
        page.getByText(/email de confirmation/i)
      ).toBeVisible({ timeout: 10000 });
    });
  });
});
