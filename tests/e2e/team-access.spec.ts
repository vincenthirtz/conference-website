// E2E — /auth/team-access (lot P10, trous e2e) : consommation du lien magique
// « accès espace équipe » envoyé après la création d'une équipe.
//
// Le lien est un VRAI lien magique Supabase (`admin.generateLink`, service
// role) : la page l'échange par `verifyOtp(token_hash)` puis redirige vers
// `next` — seulement s'il reste dans /player (anti open-redirect).
import { test, expect } from '@playwright/test';
import {
  createTestPlayer,
  deleteTestUser,
  supabaseTestClient,
} from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  loginPlayer,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';

const PLAYER_EMAIL = perWorker('hirtzvincent+e2eteamaccess@gmail.com');

// lib/i18n/locales/fr/teamAccess.ts
const T = {
  heading: 'Connexion à ton espace équipe',
  errorNoSession:
    "Impossible d'établir la session. Le lien a peut-être déjà été utilisé.",
  singleUseNote:
    'Les liens de connexion sont à usage unique et expirent rapidement.',
  backToLogin: 'Se connecter avec un mot de passe',
};

async function magicLinkTokenHash(email: string): Promise<string> {
  const { data, error } = await supabaseTestClient!.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) throw error;
  return data.properties.hashed_token;
}

test.describe('/auth/team-access', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('lien magique valide → session ouverte, redirection vers next', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    const tokenHash = await magicLinkTokenHash(PLAYER_EMAIL);

    await page.goto(
      `/auth/team-access?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/player/my-teams')}`
    );

    await page.waitForURL(/\/player\/my-teams/, { timeout: 30000 });
    // La session est réelle : l'espace joueuse ne renvoie pas vers /login.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('next hors /player → repli sur /player/manage-team', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    // Session déjà ouverte (cookie) : la page ne réclame pas de jeton.
    await loginPlayer(page, PLAYER_EMAIL, '/player');

    await page.goto(
      `/auth/team-access?next=${encodeURIComponent('//evil.example.com/player')}`
    );

    await page.waitForURL(/\/player\/manage-team/, { timeout: 30000 });
    expect(page.url()).not.toContain('evil.example.com');
  });

  test('sans lien ni session → erreur et retour à la connexion', async ({
    page,
  }) => {
    await page.goto('/auth/team-access');

    await expect(
      page.getByRole('heading', { name: T.heading, level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole('alert').filter({ hasText: T.errorNoSession })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(T.singleUseNote)).toBeVisible();

    await page.getByRole('link', { name: T.backToLogin }).click();
    await page.waitForURL(/\/login/, { timeout: 15000 });
  });
});
