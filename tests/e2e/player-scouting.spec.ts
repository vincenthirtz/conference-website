// E2E — /player/scouting/[teamId] (lot P10, trous e2e) : le dossier
// d'adversaire s'affiche et « Proposer un scrim » mène au formulaire de
// demande, l'adversaire présélectionné.
//
// VRAIE joueuse connectée par /login ; les routes de données
// (`/api/player/scouting`, `/api/player/team`) sont simulées : aucune équipe
// ni confrontation à créer en base.
import { test, expect, type Page } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  loginPlayer,
  mockApiJson,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';

const PLAYER_EMAIL = perWorker('hirtzvincent+e2escouting@gmail.com');

const TARGET_ID = '0b7e4c1a-2d3f-4a5b-9c6d-1e2f3a4b5c6d';
const MY_TEAM_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

// lib/i18n/locales/fr/scouting.ts
const T = {
  pageTitle: 'Dossier : Les Comètes',
  emptyTitle: "Rien à analyser pour l'instant",
  proposeScrim: 'Proposer un scrim',
  backToDirectory: "← Retour à l'annuaire",
  retry: 'Réessayer',
};

const EMPTY_DOSSIER = {
  myTeam: { id: MY_TEAM_ID, name: 'Les Aurores' },
  target: {
    id: TARGET_ID,
    name: 'Les Comètes',
    shortName: null,
    logoUrl: null,
    slug: null,
    country: null,
    rating: null,
    reliability: {
      received: 0,
      answered: 0,
      ignored: 0,
      responseRate: null,
      medianResponseHours: null,
    },
  },
  report: {
    headToHead: { played: 0, wins: 0, losses: 0, draws: 0, recent: [] },
    recentForm: null,
    record: null,
    commonOpponents: [],
    usualSlots: null,
  },
  teamNames: {},
  myNotes: [],
  timezone: 'Europe/Paris',
};

/** Capitaine de « Les Aurores », avec le droit de proposer des scrims. */
async function mockManagedTeam(page: Page) {
  await mockApiJson(page, '/api/player/team', {
    team: {
      id: MY_TEAM_ID,
      slug: null,
      name: 'Les Aurores',
      short_name: null,
      logo_url: null,
    },
    members: [],
    isCaptain: true,
    isManager: true,
    permissions: ['manage_scrims'],
    managedTeams: [],
    rosterLock: null,
  });
}

test.describe('/player/scouting/[teamId]', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  // Même piège que la grille de scrim : redirigée avant `router.isReady`, la
  // page partait vers le repli `/login?next=/player/teams` et le dossier
  // ouvert depuis un lien était perdu. Aucune session requise.
  test('sans session → /login, retour sur le dossier conservé', async ({
    page,
  }) => {
    const path = `/player/scouting/${TARGET_ID}`;
    await page.goto(path);
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(new URL(page.url()).searchParams.get('next')).toBe(path);
  });

  test('affiche le dossier et « Proposer un scrim » présélectionne l’adversaire', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockManagedTeam(page);
    let requestedTarget: string | null = null;
    await page.route(
      (url) => url.pathname === '/api/player/scouting',
      async (route) => {
        requestedTarget = new URL(route.request().url()).searchParams.get(
          'team'
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_DOSSIER),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, `/player/scouting/${TARGET_ID}`);

    await expect(page.getByRole('heading', { name: T.pageTitle })).toBeVisible({
      timeout: 15000,
    });
    expect(requestedTarget).toBe(TARGET_ID);
    await expect(page.getByText(T.emptyTitle)).toBeVisible();
    await expect(
      page.getByRole('link', { name: T.backToDirectory })
    ).toHaveAttribute('href', '/player/teams');

    const propose = page.getByRole('link', { name: T.proposeScrim }).first();
    await expect(propose).toHaveAttribute(
      'href',
      `/player/requests?tab=scrim&team=${TARGET_ID}`
    );
    await propose.click();
    await page.waitForURL(/\/player\/requests\?tab=scrim&team=/, {
      timeout: 15000,
    });
  });

  test('dossier indisponible → alerte avec « Réessayer »', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockManagedTeam(page);
    await mockApiJson(
      page,
      '/api/player/scouting',
      { error: 'Dossier indisponible.' },
      500
    );

    await loginPlayer(page, PLAYER_EMAIL, `/player/scouting/${TARGET_ID}`);

    const alert = page.getByRole('alert').filter({ hasText: /indisponible/ });
    await expect(alert).toBeVisible({ timeout: 20000 });
    await expect(alert.getByRole('button', { name: T.retry })).toBeVisible();
    await expect(page.getByRole('link', { name: T.proposeScrim })).toHaveCount(
      0
    );
  });
});
