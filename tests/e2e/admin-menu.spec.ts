import { test, expect } from '@playwright/test';
import {
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const password = 'TestPassw0rd!';
const STAFF_EMAIL = `hirtzvincent+adminmenu@gmail.com`;

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

test.describe('Admin menu categories', () => {
  test.beforeAll(async () => {
    if (!skipIfNoServiceRole()) {
      await deleteTestStaff(STAFF_EMAIL);
      await createTestStaff(STAFF_EMAIL, password, 'admin');
    }
  });

  test.afterAll(async () => {
    if (!skipIfNoServiceRole()) {
      await deleteTestStaff(STAFF_EMAIL);
    }
  });

  test('Le menu admin affiche la catégorie Gestion partenaires', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login
    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');

    // Wait for redirect to admin dashboard
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');

    // Verify the "Gestion partenaires" category is visible
    await expect(page.getByText('Gestion partenaires')).toBeVisible({
      timeout: 10000,
    });

    // Verify the partner links are present
    await expect(page.getByText('Partenaires – liste')).toBeVisible();
    await expect(page.getByText('Ajouter un partenaire')).toBeVisible();
    await expect(page.getByText('Demandes de partenariat')).toBeVisible();
  });

  test('Les liens partenaires fonctionnent', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login
    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    // Click on "Partenaires – liste"
    await page.getByText('Partenaires – liste').click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/admin/partners');
  });
});
