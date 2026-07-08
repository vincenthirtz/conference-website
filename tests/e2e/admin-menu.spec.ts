import { test, expect } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

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

  test('Le menu admin expose les liens partenaires sous Contenu', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login
    await page.goto('/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');

    // Wait for redirect to admin dashboard
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');

    // Ouvre la catégorie "Contenu" du top-bar, puis la sous-section "Partenaires"
    await page.getByRole('button', { name: 'Contenu' }).click();
    await page.getByRole('button', { name: 'Partenaires' }).click();

    // Les liens partenaires de la sous-section sont visibles
    await expect(page.getByText('Partenaires – liste')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Demandes de partenariat')).toBeVisible();
  });

  test('Les liens partenaires fonctionnent', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login
    await page.goto('/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    // Déploie Contenu > Partenaires puis clique sur "Partenaires – liste"
    await page.getByRole('button', { name: 'Contenu' }).click();
    await page.getByRole('button', { name: 'Partenaires' }).click();
    await page.getByText('Partenaires – liste').click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/admin/partners');
  });
});
