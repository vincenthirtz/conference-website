import { test, expect } from '@playwright/test';
import { deleteTeamsByName } from '../utils/supabaseTestClient';

const TEAM_NAME = `E2E Team ${Date.now()}`;
const PLAYER_EMAIL = 'hirtzvincent+testjoueur@gmail.com';
const EXTRA_MEMBER_EMAILS = Array.from({ length: 5 }).map(
  (_v, idx) => `hirtzvincent+testjoueur${idx + 1}@gmail.com`
);

test.describe.serial('Team creation page', () => {
  test.beforeAll(async () => {
    await deleteTeamsByName([`${TEAM_NAME}%`, `${TEAM_NAME}-bulk%`, 'E2E Team%']);
  });

  test.afterAll(async () => {
    await deleteTeamsByName([`${TEAM_NAME}%`, `${TEAM_NAME}-bulk%`, 'E2E Team%']);
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

  test('Créer une équipe avec 5 membres', async ({ page }) => {
    test.skip(
      !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
      'Supabase service role manquant'
    );

    const teamName = `${TEAM_NAME}-bulk`;

    await page.goto('/team/create');

    await page.getByPlaceholder('Ex : Phénix').fill(teamName);
    await page.getByPlaceholder('France, Europe…').fill('France');
    await page
      .getByPlaceholder('Pitch rapide, palmarès, ambitions…')
      .fill('Equipe test e2e avec 5 membres.');

    // Premier membre déjà présent
    await page.getByPlaceholder('joueuse@email.tld').first().fill(PLAYER_EMAIL);
    await page.getByPlaceholder('player / coach / sub').first().fill('player');

    // Ajouter 4 autres membres (total 5)
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Ajouter une personne' }).click();
      const emailInput = page
        .getByPlaceholder('joueuse@email.tld')
        .nth(i + 1);
      const roleInput = page
        .getByPlaceholder('player / coach / sub')
        .nth(i + 1);
      await emailInput.fill(EXTRA_MEMBER_EMAILS[i]);
      await roleInput.fill('player');
    }

    await page.getByRole('button', { name: "Créer l'équipe" }).click();

    await expect(page.getByText('Équipe créée')).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole('link', { name: /Voir la page équipe/i })
    ).toBeVisible({ timeout: 10000 });
  });
});
