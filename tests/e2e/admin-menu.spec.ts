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

  // La barre « Contenu > Partenaires > Partenaires – liste » a laissé place à
  // la barre latérale de l'AdminShell : une section « Contenu » (titre h2) et
  // UNE entrée « Partenaires » vers le hub à onglets /admin/partners
  // (fusion liste + demandes, cf. components/admin/navigation/adminNav.ts).
  async function loginAsAdmin(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', password);
    await page.click('#main-content button[type="submit"]');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
  }

  function contentSection(page: import('@playwright/test').Page) {
    return page
      .getByRole('navigation', { name: /Navigation de l.administration/ })
      .first()
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Contenu' }) });
  }

  test('Le menu admin expose les liens partenaires sous Contenu', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    await expect(
      contentSection(page).getByRole('link', { name: 'Partenaires' })
    ).toHaveAttribute('href', '/admin/partners');
  });

  test('Les liens partenaires fonctionnent', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    await contentSection(page)
      .getByRole('link', { name: 'Partenaires' })
      .click();
    await page.waitForURL(/\/admin\/partners/);
  });
});
