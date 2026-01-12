import { test, expect } from '@playwright/test';
import {
  createTestPlayer,
  createTestStaff,
  deleteTestUser,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const password = 'TestPassw0rd!';
const PLAYER_EMAIL = `hirtzvincent+emailchangeplayer@gmail.com`;
const STAFF_EMAIL = `hirtzvincent+emailchangestaff@gmail.com`;
const NEW_EMAIL_SUFFIX = '+newemail';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function cleanupUsers() {
  await deleteTestUser(PLAYER_EMAIL);
  await deleteTestUser(PLAYER_EMAIL.replace('@', `${NEW_EMAIL_SUFFIX}@`));
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

  test.describe('Player email change', () => {
    test.beforeAll(async () => {
      await createTestPlayer(PLAYER_EMAIL, password);
    });

    test('displays email change form on /player page', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as player via /register (login form)
      await page.goto('/register?mode=login');
      await page.fill('input#email', PLAYER_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      // Wait for redirect to /player
      await page.waitForURL(/\/player/, { timeout: 10000 });

      // Check email change form is present
      await expect(page.getByText("Changer d'email")).toBeVisible();
      await expect(page.getByPlaceholder('Nouvel email')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Changer mon email' })
      ).toBeVisible();
    });

    test('shows validation when submitting same email', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as player
      await page.goto('/register?mode=login');
      await page.fill('input#email', PLAYER_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/player/, { timeout: 10000 });

      // Try to submit with the same email
      const emailInput = page.getByPlaceholder('Nouvel email');
      await emailInput.fill(PLAYER_EMAIL);

      // Button should be disabled when email is the same
      const submitButton = page.getByRole('button', { name: 'Changer mon email' });
      await expect(submitButton).toBeDisabled();
    });

    test('submits email change request successfully', async ({ page }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      // Login as player
      await page.goto('/register?mode=login');
      await page.fill('input#email', PLAYER_EMAIL);
      await page.fill('input#password', password);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/player/, { timeout: 10000 });

      // Fill in new email
      const newEmail = PLAYER_EMAIL.replace('@', `${NEW_EMAIL_SUFFIX}@`);
      const emailInput = page.getByPlaceholder('Nouvel email');
      await emailInput.fill(newEmail);

      // Submit
      const submitButton = page.getByRole('button', { name: 'Changer mon email' });
      await submitButton.click();

      // Wait for success message
      await expect(
        page.getByText(/email de confirmation/i)
      ).toBeVisible({ timeout: 10000 });
    });
  });

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

      // Check email change form is present
      await expect(page.getByText('Changer mon email')).toBeVisible();
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
      const submitButton = page
        .locator('form')
        .filter({ hasText: 'Changer mon email' })
        .getByRole('button', { name: 'Changer mon email' });
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
      const submitButton = page
        .locator('form')
        .filter({ hasText: 'Changer mon email' })
        .getByRole('button', { name: 'Changer mon email' });
      await submitButton.click();

      // Wait for success message
      await expect(
        page.getByText(/email de confirmation/i)
      ).toBeVisible({ timeout: 10000 });
    });
  });
});
