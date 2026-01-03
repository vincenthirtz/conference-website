import { test, expect } from '@playwright/test';
import { deleteTeamsByName } from '../utils/supabaseTestClient';

const TEAM_NAME = `E2E Team ${Date.now()}`;

test.describe.serial('Team creation page', () => {
  test.beforeAll(async () => {
    await deleteTeamsByName(TEAM_NAME);
  });

  test.afterAll(async () => {
    await deleteTeamsByName(TEAM_NAME);
  });

  test('Créer une équipe sans membres', async ({ page }) => {
    test.skip(
      !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
      'Supabase service role manquant'
    );

    await page.goto('/team/create');

    await page.getByPlaceholder('Ex : Phénix').fill(TEAM_NAME);
    await page.getByPlaceholder('France, Europe…').fill('France');
    await page.getByPlaceholder('Pitch rapide, palmarès, ambitions…').fill(
      'Equipe test e2e.'
    );

    await page.getByRole('button', { name: "Créer l'équipe" }).click();

    await expect(page.getByText('Équipe créée')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(TEAM_NAME)).toBeVisible();

    // Optionnel : le lien vers la page équipe doit être présent
    await expect(
      page.getByRole('link', { name: /Voir la page équipe/i })
    ).toBeVisible();
  });
});
