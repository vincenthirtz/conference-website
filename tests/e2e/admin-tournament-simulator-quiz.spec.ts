import { test, expect } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

// E2E for the guided "Quiz/slides" mode of the tournament simulator
// (/admin/tournament-simulator). The quiz runs entirely on fake, in-memory
// data (no tournament seeding needed) — only a staff session is required.

const password = 'TestPassw0rd!';
const STAFF_EMAIL = `hirtzvincent+simquiz@gmail.com`;

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

test.describe('Simulateur de tournoi — mode Quiz', () => {
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

  test('déroule le quiz et révèle un champion, puis ouvre le bracket dans l’éditeur', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // --- Login -----------------------------------------------------------
    await page.goto('/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // --- Open the simulator ---------------------------------------------
    await page.goto('/admin/tournament-simulator');
    await page.waitForLoadState('networkidle');
    // Form mode is the default: the config panel is visible.
    await expect(
      page.getByRole('heading', { name: 'Configuration' })
    ).toBeVisible();

    // --- Switch to Quiz mode --------------------------------------------
    await page.getByRole('button', { name: /Mode Quiz/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Composez votre tournoi' })
    ).toBeVisible();
    await page.getByRole('button', { name: /Commencer/ }).click();

    // --- Step 1: format (single elim is the recommended default) --------
    await expect(
      page.getByRole('heading', { name: 'Quel format de tournoi ?' })
    ).toBeVisible();
    await page.getByRole('button', { name: /Single Elimination/ }).click();

    // --- Step 2: team count (auto-advanced here) ------------------------
    await expect(
      page.getByRole('heading', { name: "Combien d'équipes ?" })
    ).toBeVisible();
    await page.getByRole('button', { name: /conseillé 8/ }).click();

    // --- Step 3: best-of -------------------------------------------------
    await expect(
      page.getByRole('heading', { name: 'Quel format de match ?' })
    ).toBeVisible();
    await page.getByRole('button', { name: /BO3/ }).click();

    // --- Step 4: map pool ------------------------------------------------
    await expect(
      page.getByRole('heading', { name: 'Combien de maps dans le pool ?' })
    ).toBeVisible();
    await page.getByRole('button', { name: /conseillé 7/ }).click();

    // --- Recap + launch --------------------------------------------------
    await expect(
      page.getByRole('heading', { name: 'Tout est prêt !' })
    ).toBeVisible();
    await page.getByRole('button', { name: /Lancer le tournoi/ }).click();

    // --- Reveal: a champion + fun stats ---------------------------------
    // The rolling state clears after ~850ms; give the reveal room to mount.
    await expect(page.getByText('Champion', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Matchs joués')).toBeVisible();
    // Reveal-only actions confirm we reached the champion screen.
    await expect(page.getByRole('button', { name: /Rejouer/ })).toBeVisible();

    // --- Open in editor: back to form mode with a simulated bracket ------
    await page.getByRole('button', { name: /Ouvrir dans l'éditeur/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Configuration' })
    ).toBeVisible();
  });
});
