// E2E — /player/pronostics (lot P10, trous e2e) : la page s'affiche et la
// joueuse pose un pronostic en un clic.
//
// Même harnais que les autres specs joueuse : VRAIE joueuse de test (service
// role) connectée par le vrai formulaire /login ; seules les routes de DONNÉES
// `/api/player/predictions*` sont simulées — l'écran est déterministe et rien
// n'est écrit en base (le PUT du pronostic est intercepté).
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  inMinutes,
  loginPlayer,
  mockApiJson,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';

const PLAYER_EMAIL = perWorker('hirtzvincent+e2epronostics@gmail.com');

// lib/i18n/locales/fr/matchPrediction.ts
const T = {
  pageTitle: 'Pronostics',
  openTitle: 'À pronostiquer',
  pickAurores: 'Je vois Les Aurores gagner',
  saved: 'Pronostic enregistré',
  recentEmpty: 'Tu n’as encore rien pronostiqué.',
  loadError: 'Impossible de charger les pronostics.',
};

const MATCH_ID = '6f1d7c2a-3b4e-4f5a-8b6c-7d8e9f0a1b2c';
const AURORES = { id: 'team-aurores', name: 'Les Aurores', logoUrl: null };
const COMETES = { id: 'team-cometes', name: 'Les Comètes', logoUrl: null };

function predictions(prediction: { teamId: string } | null) {
  return {
    reward: 10,
    open: [
      {
        matchId: MATCH_ID,
        tournamentName: 'Conference Cup',
        scheduledAt: inMinutes(24 * 60),
        team1: AURORES,
        team2: COMETES,
        winnerTeamId: null,
        prediction: prediction
          ? {
              teamId: prediction.teamId,
              result: null,
              updatedAt: new Date().toISOString(),
            }
          : null,
      },
    ],
    recent: [],
    ineligibility: null,
  };
}

const LEADERBOARD = {
  rows: [],
  me: null,
  showsMyName: false,
  minSettled: 3,
  participants: 0,
  truncated: false,
  reward: 10,
};

test.describe('/player/pronostics', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('sans session → /login, retour sur la page conservé', async ({
    page,
  }) => {
    await page.goto('/player/pronostics');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(new URL(page.url()).searchParams.get('next')).toBe(
      '/player/pronostics'
    );
  });

  test('affiche les matchs ouverts et enregistre un pronostic', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    let picked: string | null = null;
    let putBody: unknown = null;
    await page.route(
      (url) => url.pathname === '/api/player/predictions',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(predictions(picked ? { teamId: picked } : null)),
        })
    );
    await mockApiJson(page, '/api/player/predictions/leaderboard', LEADERBOARD);
    await page.route(
      (url) => url.pathname === `/api/player/predictions/${MATCH_ID}`,
      async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        putBody = route.request().postDataJSON();
        picked = (putBody as { teamId: string }).teamId;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            matchId: MATCH_ID,
            teamId: picked,
            updatedAt: new Date().toISOString(),
          }),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/pronostics');

    await expect(
      page.getByRole('heading', { name: T.pageTitle, level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(T.openTitle)).toBeVisible();
    await expect(page.getByText(T.recentEmpty)).toBeVisible();

    const pick = page.getByRole('button', { name: T.pickAurores });
    await expect(pick).toHaveAttribute('aria-pressed', 'false');
    await pick.click();

    await expect(page.getByText(T.saved)).toBeVisible({ timeout: 10000 });
    expect(putBody).toEqual({ teamId: AURORES.id });
    // Le panneau se recharge : le choix apparaît enfoncé.
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
  });

  test('lecture en échec → message d’erreur, pas de liste', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockApiJson(page, '/api/player/predictions', { error: 'boom' }, 500);
    await mockApiJson(page, '/api/player/predictions/leaderboard', LEADERBOARD);

    await loginPlayer(page, PLAYER_EMAIL, '/player/pronostics');

    await expect(page.getByText(T.loadError)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: T.pickAurores })).toHaveCount(
      0
    );
  });
});
