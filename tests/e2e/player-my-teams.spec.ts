// E2E — /player/my-teams (lot P10, trous e2e) : la console multi-équipes
// s'affiche (une ligne par équipe encadrée) et « Gérer » ouvre l'écran de
// gestion de CETTE équipe.
//
// VRAIE joueuse connectée par /login ; `/api/player/my-teams` est simulée
// (aucune équipe à créer en base).
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

const PLAYER_EMAIL = perWorker('hirtzvincent+e2emyteams@gmail.com');

// lib/i18n/locales/fr/playerMyTeams.ts
const T = {
  heading: 'Mes équipes',
  captainBadge: 'Capitaine',
  rosterOk: 'Complet',
  pending2: '2 en attente',
  openTeam: 'Gérer ↗',
  empty: 'Tu n’encadres aucune équipe pour le moment.',
};

function row(over: {
  id: string;
  name: string;
  isCaptain: boolean;
  pendingJoinRequests?: number;
}) {
  return {
    team: { id: over.id, name: over.name, slug: null, logoUrl: null },
    isCaptain: over.isCaptain,
    permissions: over.isCaptain
      ? ['manage_join_requests', 'validate_lineup', 'manage_scrims']
      : ['validate_lineup'],
    roster: { size: 6, minPlayers: 5, shortfall: 0 },
    nextMatch: {
      id: `match-${over.id}`,
      scheduledAt: inMinutes(3 * 24 * 60),
      opponentName: 'Team Adverse',
      checkedIn: false,
      checkinOpensAt: null,
      checkinIsOpen: false,
      lineupValidated: false,
    },
    pendingJoinRequests: over.pendingJoinRequests ?? 0,
  };
}

test.describe('/player/my-teams', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('liste les équipes encadrées et « Gérer » ouvre la gestion', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockApiJson(page, '/api/player/my-teams', {
      teams: [
        row({
          id: 'team-a',
          name: 'Les Aurores',
          isCaptain: true,
          pendingJoinRequests: 2,
        }),
        row({ id: 'team-b', name: 'Les Comètes', isCaptain: false }),
      ],
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/my-teams');

    await expect(
      page.getByRole('heading', { name: T.heading, level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Les Aurores')).toBeVisible();
    await expect(page.getByText('Les Comètes')).toBeVisible();
    await expect(page.getByText(T.captainBadge)).toHaveCount(1);
    await expect(page.getByText(T.pending2)).toBeVisible();

    const manage = page.getByRole('link', { name: T.openTeam });
    await expect(manage).toHaveCount(2);
    await manage.first().click();
    await page.waitForURL(/\/player\/manage-team/, { timeout: 15000 });
  });

  test('aucune équipe encadrée → état vide', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockApiJson(page, '/api/player/my-teams', { teams: [] });

    await loginPlayer(page, PLAYER_EMAIL, '/player/my-teams');

    await expect(page.getByText(T.empty)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: T.openTeam })).toHaveCount(0);
  });
});
