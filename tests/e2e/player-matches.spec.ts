// E2E — pages/player/matches.tsx ("Mes matchs")
//
// GET /api/player/matches → { team, matches[] }. Two sections "À venir" /
// "Résultats". An upcoming match with checkin.isOpen && !alreadyCheckedIn
// shows a "Check-in" link to /player/checkin; past matches show score +
// win/loss/draw badge. Empty states: no team, no matches.
//
// Auth = real player login; /api/player/matches is route-mocked per case.
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
  buildMatch,
  inMinutes,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+playermatches@gmail.com`;

test.describe('Player matches page', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('shows upcoming + results sections with badges and check-in CTA', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, '/api/player/matches', {
      team: { id: 'team-1', name: 'Les Testeuses' },
      matches: [
        // Upcoming, check-in open and not yet done → "Check-in" CTA.
        buildMatch({
          id: 'm-upcoming',
          status: 'pending',
          scheduledAt: inMinutes(20),
          opponent: { id: 'opp-1', name: 'Rivales FC' },
          checkin: {
            token: 'tok-upcoming',
            alreadyCheckedIn: false,
            opensAt: inMinutes(-10),
            closesAt: inMinutes(20),
            isOpen: true,
            isPassed: false,
          },
        }),
        // Past win.
        buildMatch({
          id: 'm-win',
          status: 'completed',
          scheduledAt: inMinutes(-120),
          opponent: { id: 'opp-2', name: 'Anciennes' },
          score: { mine: 3, opponent: 1 },
          result: 'win',
          checkin: null,
        }),
        // Past loss.
        buildMatch({
          id: 'm-loss',
          status: 'completed',
          scheduledAt: inMinutes(-240),
          opponent: { id: 'opp-3', name: 'Vétéranes' },
          score: { mine: 0, opponent: 2 },
          result: 'loss',
          checkin: null,
        }),
      ],
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/matches');

    await expect(
      page.getByRole('heading', { name: 'Mes matchs', level: 1 })
    ).toBeVisible({ timeout: 10000 });

    // Sections.
    await expect(page.getByRole('heading', { name: /À venir/ })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Résultats/ })
    ).toBeVisible();

    // Result badges.
    await expect(page.getByText('Victoire')).toBeVisible();
    await expect(page.getByText('Défaite')).toBeVisible();

    // Scores rendered.
    await expect(page.getByText(/3.*–.*1/).first()).toBeVisible();

    // Check-in CTA links to /player/checkin.
    const cta = page.getByRole('link', { name: /Check-in/ });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/player/checkin');
  });

  test('empty state: player has no team', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, '/api/player/matches', {
      team: null,
      matches: [],
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/matches');

    await expect(
      page.getByText(/Tu n'es pas encore dans une équipe/)
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('link', { name: 'Aller au tableau de bord' })
    ).toBeVisible();
  });

  test('empty state: team but no scheduled matches', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, '/api/player/matches', {
      team: { id: 'team-1', name: 'Les Testeuses' },
      matches: [],
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/matches');

    await expect(page.getByText('Aucun match programmé')).toBeVisible({
      timeout: 10000,
    });
  });
});
