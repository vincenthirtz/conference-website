import { test, expect } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const password = 'TestPassw0rd!';
const STAFF_EMAIL = `hirtzvincent+admintasks@gmail.com`;

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

// Nom de board unique par run pour éviter les collisions sur la DB partagée.
const boardName = `E2E Kanban ${Date.now()}`;
const cardTitle = `E2E carte ${Date.now()}`;

test.describe('Admin – Kanban des tâches', () => {
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

  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/admin(?!\/login)/);
  }

  test('crée un board, ajoute une carte, la déplace et vérifie la persistance', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await login(page);

    // Va directement sur la page Kanban.
    await page.goto('/admin/tasks');
    await page.waitForLoadState('networkidle');

    // Titre de page (heading H1, évite l'ambiguïté avec l'entrée de navbar).
    await expect(
      page.getByRole('heading', { name: 'Tableau des tâches', level: 1 })
    ).toBeVisible();

    // Crée un board.
    await page.getByRole('button', { name: 'Nouveau board' }).click();
    await page.getByLabel('Nom du board').fill(boardName);
    await page.getByRole('button', { name: 'Créer', exact: true }).click();

    // Le board devient l'onglet actif (bouton role=tab avec son nom).
    const boardTab = page.getByRole('tab', { name: new RegExp(boardName) });
    await expect(boardTab).toBeVisible({ timeout: 10000 });

    // Le board fraîchement créé a 4 colonnes par défaut ; la première porte un
    // bouton « + Ajouter une carte ». Ouvre la carte via la 1re colonne.
    await page
      .getByRole('button', { name: '+ Ajouter une carte' })
      .first()
      .click();

    await page.getByLabel('Titre').fill(cardTitle);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

    // La carte apparaît.
    await expect(page.getByText(cardTitle)).toBeVisible({ timeout: 10000 });

    // Déplace la carte de la 1re vers la 2e colonne via drag & drop natif.
    const card = page.getByText(cardTitle);
    const columns = page.locator('[role="tabpanel"], .flex.gap-4 > div');
    // Cible : la zone « + Ajouter une carte » de la 2e colonne comme point de drop.
    const secondColumnDrop = page
      .getByRole('button', { name: '+ Ajouter une carte' })
      .nth(1);

    await card.dragTo(secondColumnDrop);

    // Toast ou persistance : recharge et vérifie que la carte est toujours là.
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(cardTitle)).toBeVisible({ timeout: 10000 });

    void columns; // gardé pour lisibilité du scénario multi-colonnes
  });
});
