import { test, expect, type Page } from '@playwright/test';
import { deleteTeamsByName, deleteTestUser } from '../utils/supabaseTestClient';

/**
 * Le formulaire public de création d'équipe exige désormais un captcha HMAC
 * (anti-abus : l'endpoint peut créer des comptes auth). Le challenge est une
 * opération arithmétique affichée sous la forme "a OP b = ?". On lit la
 * question rendue, on calcule la réponse et on la saisit avant de soumettre.
 */
async function solveCaptcha(page: Page): Promise<void> {
  const questionLocator = page.getByText(/[0-9]+\s*[+\-×]\s*[0-9]+\s*=\s*\?/);
  await expect(questionLocator).toBeVisible({ timeout: 10000 });
  const raw = (await questionLocator.textContent()) ?? '';
  const match = raw.match(/(-?\d+)\s*([+\-×])\s*(-?\d+)/);
  if (!match) throw new Error(`Captcha question illisible: "${raw}"`);
  const a = parseInt(match[1], 10);
  const op = match[2];
  const b = parseInt(match[3], 10);
  const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
  await page.getByPlaceholder('Réponse').fill(String(answer));
}

const TEAM_NAME = `E2E Team ${Date.now()}`;
const PLAYER_EMAIL = 'hirtzvincent+testjoueur@gmail.com';
const PLAYER_BTAG = 'TestPlayer#0001';
const EXTRA_MEMBER_EMAILS = Array.from({ length: 5 }).map(
  (_v, idx) => `hirtzvincent+testjoueur${idx + 1}@gmail.com`
);
const EXTRA_MEMBER_BTAGS = Array.from({ length: 5 }).map(
  (_v, idx) => `TestMember#00${idx + 2}`
);
const ALL_TEST_EMAILS = [PLAYER_EMAIL, ...EXTRA_MEMBER_EMAILS];

test.describe.serial('Team creation page', () => {
  test.beforeAll(async () => {
    await deleteTeamsByName([
      `${TEAM_NAME}%`,
      `${TEAM_NAME}-bulk%`,
      'E2E Team%',
    ]);
    for (const email of ALL_TEST_EMAILS) {
      await deleteTestUser(email);
    }
  });

  test.afterAll(async () => {
    await deleteTeamsByName([
      `${TEAM_NAME}%`,
      `${TEAM_NAME}-bulk%`,
      'E2E Team%',
    ]);
    for (const email of ALL_TEST_EMAILS) {
      await deleteTestUser(email);
    }
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
    await page
      .getByPlaceholder('Pitch rapide, palmarès, ambitions…')
      .fill('Equipe test e2e.');
    // Ajouter un membre par défaut
    await page.getByPlaceholder('joueuse@email.tld').fill(PLAYER_EMAIL);
    await page.getByPlaceholder('player / coach / sub').fill('player');
    await page.getByPlaceholder('Pseudo#0000').fill(PLAYER_BTAG);

    await solveCaptcha(page);

    await page.getByRole('button', { name: "Créer l'équipe" }).click();

    await expect(page.getByText('Équipe créée')).toBeVisible({
      timeout: 20000,
    });

    // Le lien de page équipe doit apparaître après succès
    await expect(
      page.getByRole('link', { name: /Voir la page équipe/i })
    ).toBeVisible({ timeout: 10000 });

    // Vérifie côté base que l'équipe existe
    if (
      process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
    ) {
      const { supabaseTestClient } =
        await import('../utils/supabaseTestClient');
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
    await page.getByPlaceholder('Pseudo#0000').first().fill(PLAYER_BTAG);

    // Ajouter 4 autres membres (total 5)
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Ajouter une personne' }).click();
      const emailInput = page.getByPlaceholder('joueuse@email.tld').nth(i + 1);
      const roleInput = page
        .getByPlaceholder('player / coach / sub')
        .nth(i + 1);
      const btagInput = page.getByPlaceholder('Pseudo#0000').nth(i + 1);
      await emailInput.fill(EXTRA_MEMBER_EMAILS[i]);
      await roleInput.fill('player');
      await btagInput.fill(EXTRA_MEMBER_BTAGS[i]);
    }

    await solveCaptcha(page);

    await page.getByRole('button', { name: "Créer l'équipe" }).click();

    await expect(page.getByText('Équipe créée')).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole('link', { name: /Voir la page équipe/i })
    ).toBeVisible({ timeout: 10000 });
  });
});
