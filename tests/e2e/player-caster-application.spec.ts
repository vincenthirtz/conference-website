// E2E — /player/caster-application (lot P10, trous e2e) : le formulaire de
// candidature au cast s'affiche et l'envoi bascule sur « en cours d'examen ».
//
// VRAIE joueuse connectée par /login ; `/api/demandes/caster-application` est
// simulée (GET + POST) : aucune demande n'est créée en base.
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  loginPlayer,
  mockApiJson,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';

const PLAYER_EMAIL = perWorker('hirtzvincent+e2ecasterapp@gmail.com');
const API = '/api/demandes/caster-application';

// lib/i18n/locales/fr/casterApplication.ts
const T = {
  pageTitle: 'Rejoindre le cast',
  motivation: 'Motivation (optionnel)',
  portfolio: 'Lien portfolio / Twitch (optionnel)',
  submit: 'Envoyer ma candidature',
  sent: 'Ta candidature au cast a bien été envoyée !',
  pendingTitle: "Demande en cours d'examen",
  loadError: 'Impossible de charger ta candidature. Réessaie.',
  retry: 'Réessayer',
};

test.describe('/player/caster-application', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('candidature envoyée → statut « en cours d’examen »', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    let postBody: unknown = null;
    await page.route(
      (url) => url.pathname === API,
      async (route) => {
        const req = route.request();
        if (req.method() === 'POST') {
          postBody = req.postDataJSON();
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              application: {
                id: 'app-1',
                status: 'pending',
                comment: null,
                created_at: new Date().toISOString(),
              },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ application: null }),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/caster-application');

    await expect(
      page.getByRole('heading', { name: T.pageTitle, level: 1 })
    ).toBeVisible({ timeout: 15000 });

    await page.getByLabel(T.motivation).fill('Je caste les scrims du jeudi.');
    await page.getByLabel(T.portfolio).fill('https://twitch.tv/ma-chaine');
    await page.getByRole('button', { name: T.submit }).click();

    await expect(page.getByText(T.pendingTitle)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(T.sent)).toBeVisible();
    expect(postBody).toEqual({
      motivation: 'Je caste les scrims du jeudi.',
      portfolioUrl: 'https://twitch.tv/ma-chaine',
    });
    // Une demande en cours : le formulaire disparaît.
    await expect(page.getByRole('button', { name: T.submit })).toHaveCount(0);
  });

  test('statut illisible → alerte « Réessayer », pas de formulaire vierge', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockApiJson(page, API, { error: 'boom' }, 500);

    await loginPlayer(page, PLAYER_EMAIL, '/player/caster-application');

    const alert = page.getByRole('alert').filter({ hasText: T.loadError });
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(alert.getByRole('button', { name: T.retry })).toBeVisible();
    await expect(page.getByRole('button', { name: T.submit })).toHaveCount(0);
  });
});
