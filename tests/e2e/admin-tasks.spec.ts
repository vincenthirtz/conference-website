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

    // Pré-accepte le consentement cookies pour que la bannière (dialog fixé en
    // bas) n'intercepte pas les clics sur les boutons de la modale carte.
    await page.addInitScript(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({
          version: '1.0',
          preferences: { essential: true, analytics: false, marketing: false },
          consentDate: '2026-01-01T00:00:00.000Z',
        })
      );
    });

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

  test('ouvre une carte, ajoute un item de checklist et un commentaire', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Pré-consentement cookies (idem 1er test) pour que la bannière n'intercepte
    // pas les clics dans la modale carte.
    await page.addInitScript(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({
          version: '1.0',
          preferences: { essential: true, analytics: false, marketing: false },
          consentDate: '2026-01-01T00:00:00.000Z',
        })
      );
    });

    await login(page);

    await page.goto('/admin/tasks');
    await page.waitForLoadState('networkidle');

    // Noms uniques propres à ce test (board indépendant du 1er scénario).
    const localBoard = `E2E Détails ${Date.now()}`;
    const localCard = `E2E carte détail ${Date.now()}`;
    const checklistItem = `Item ${Date.now()}`;
    const commentBody = `Commentaire ${Date.now()}`;

    // Crée un board dédié.
    await page.getByRole('button', { name: 'Nouveau board' }).click();
    await page.getByLabel('Nom du board').fill(localBoard);
    await page.getByRole('button', { name: 'Créer', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: new RegExp(localBoard) })
    ).toBeVisible({ timeout: 10000 });

    // Crée une carte dans la 1re colonne.
    await page
      .getByRole('button', { name: '+ Ajouter une carte' })
      .first()
      .click();
    await page.getByLabel('Titre').fill(localCard);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText(localCard)).toBeVisible({ timeout: 10000 });

    // Ouvre la carte (clic sur la carte → modale d'édition).
    await page.getByText(localCard).click();
    await expect(
      page.getByRole('heading', { name: 'Modifier la carte' })
    ).toBeVisible({ timeout: 10000 });

    // --- Checklist : ajoute un item et vérifie qu'on peut le cocher. ---
    await page.getByPlaceholder('Ajouter un élément…').fill(checklistItem);
    // Le bouton "Ajouter" de la checklist (vert) — dans la section checklist.
    await page
      .getByRole('button', { name: 'Ajouter', exact: true })
      .last()
      .click();

    const itemCheckbox = page.getByRole('checkbox', { name: checklistItem });
    await expect(itemCheckbox).toBeVisible({ timeout: 10000 });
    await itemCheckbox.check();
    await expect(itemCheckbox).toBeChecked();

    // --- Commentaire : ajoute et vérifie qu'il apparaît dans le fil. ---
    await page.getByPlaceholder('Écrire un commentaire…').fill(commentBody);
    await page.getByRole('button', { name: 'Commenter', exact: true }).click();
    await expect(page.getByText(commentBody)).toBeVisible({ timeout: 10000 });
  });

  test('crée un label coloré du board et l’applique à une carte (pastille visible)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Pré-consentement cookies (idem autres tests) pour que la bannière fixée en
    // bas n'intercepte pas les clics dans les modales.
    await page.addInitScript(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({
          version: '1.0',
          preferences: { essential: true, analytics: false, marketing: false },
          consentDate: '2026-01-01T00:00:00.000Z',
        })
      );
    });

    await login(page);
    await page.goto('/admin/tasks');
    await page.waitForLoadState('networkidle');

    const localBoard = `E2E Labels ${Date.now()}`;
    const localCard = `E2E carte label ${Date.now()}`;
    const labelName = `prio-${Date.now()}`;

    // Board dédié.
    await page.getByRole('button', { name: 'Nouveau board' }).click();
    await page.getByLabel('Nom du board').fill(localBoard);
    await page.getByRole('button', { name: 'Créer', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: new RegExp(localBoard) })
    ).toBeVisible({ timeout: 10000 });

    // Ouvre le panneau des labels du board et crée un label (couleur par défaut).
    await page.getByRole('button', { name: 'Labels', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Labels du board' })
    ).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Nom du label').fill(labelName);
    await page
      .getByRole('button', { name: 'Créer le label', exact: true })
      .click();
    // Le label apparaît dans la liste (ligne éditable → input renommage).
    await expect(page.getByLabel(`Nom du label : ${labelName}`)).toBeVisible({
      timeout: 10000,
    });
    // Ferme le panneau.
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();

    // Crée une carte dans la 1re colonne.
    await page
      .getByRole('button', { name: '+ Ajouter une carte' })
      .first()
      .click();
    await page.getByLabel('Titre').fill(localCard);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText(localCard)).toBeVisible({ timeout: 10000 });

    // Ouvre la carte et applique le label via le chip cliquable du board.
    await page.getByText(localCard).click();
    await expect(
      page.getByRole('heading', { name: 'Modifier la carte' })
    ).toBeVisible({ timeout: 10000 });
    await page
      .getByRole('button', { name: `Ajouter à la carte : ${labelName}` })
      .click();
    // Enregistre la carte (mode édition).
    await page
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();

    // La pastille du label est désormais visible SUR la carte du board
    // (scopé à la carte pour éviter l'<option> homonyme du filtre par label).
    const cardEl = page.getByRole('button').filter({ hasText: localCard });
    await expect(cardEl.getByText(labelName)).toBeVisible({ timeout: 10000 });
  });
});
