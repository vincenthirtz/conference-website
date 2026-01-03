import { test, expect } from '@playwright/test';
import { deleteTeamsByName } from '../utils/supabaseTestClient';

const TEAM_NAME = `E2E Team ${Date.now()}`;
const PLAYER_EMAIL = 'hirtzvincent+testjoueur@gmail.com';

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
    // Ajouter un membre par défaut
    await page.getByPlaceholder('joueuse@email.tld').fill(PLAYER_EMAIL);
    await page.getByPlaceholder('player / coach / sub').fill('player');

    await page.getByRole('button', { name: "Créer l'équipe" }).click();

    await expect(page.getByText('Équipe créée')).toBeVisible({ timeout: 20000 });

    // Le lien de page équipe doit apparaître après succès
    await expect(
      page.getByRole('link', { name: /Voir la page équipe/i })
    ).toBeVisible({ timeout: 10000 });

    // Vérifie côté base que l'équipe existe
    if (process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY) {
      const { supabaseTestClient } = await import('../utils/supabaseTestClient');
      if (supabaseTestClient) {
        const { data, error } = await supabaseTestClient
          .from('teams')
          .select('id')
          .ilike('name', TEAM_NAME);
        expect(error).toBeNull();
        expect(data && data.length).toBeGreaterThan(0);
      }
    }
  });
});
