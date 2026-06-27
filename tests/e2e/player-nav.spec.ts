// E2E — PlayerTopBar (components/Navbar/PlayerTopBar.tsx)
//
// The fixed top-bar shown to a signed-in non-staff user on /player routes:
//   - 4 tabs (Tableau de bord / Mes matchs / Notifications / Mon profil),
//   - active tab highlight driven by pathname,
//   - logout button → signs out and lands on /.
//
// Auth is a REAL player login (see _helpers/playerSession.ts); the /api/player/*
// data endpoints are route-mocked so navigation is deterministic without DB.
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+playernav@gmail.com`;

// Empty-but-valid payloads so every /player page renders instantly.
async function mockPlayerApis(page: import('@playwright/test').Page) {
  await mockApiJson(page, '/api/player/matches', { team: null, matches: [] });
  await mockApiJson(page, '/api/player/next-match', {
    match: null,
    team: null,
    opponent: null,
    tournament: null,
    checkin: null,
  });
  await mockApiJson(page, '/api/player/notifications', {
    hasTeam: false,
    isCaptain: false,
    isManager: false,
    captainTeamId: null,
    memberTeamId: null,
    unreadMessages: 0,
    pendingScrims: 0,
    pendingJoinRequests: 0,
    checkinPending: 0,
    total: 0,
  });
  await mockApiJson(page, '/api/player/push/prefs', { prefs: [] });
}

test.describe('PlayerTopBar navigation', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('anonymous visitor on a public route does NOT see the player bar', async ({
    page,
  }) => {
    await page.goto('/');
    // The public navbar shows a login button; the player bar (with the
    // "Déconnexion" action) must not be present.
    await expect(page.locator('a:has-text("Connexion")')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: 'Déconnexion' })).toHaveCount(
      0
    );
  });

  test('signed-in player sees the top-bar with the 4 tabs', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockPlayerApis(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player');

    const bar = page.locator('div.fixed.top-0').first();
    await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible(
      {
        timeout: 10000,
      }
    );

    for (const tab of [
      'Tableau de bord',
      'Mes matchs',
      'Notifications',
      'Mon profil',
    ]) {
      await expect(
        bar.getByRole('link', { name: tab, exact: true })
      ).toBeVisible();
    }
  });

  test('tabs navigate to the right routes and highlight the active one', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockPlayerApis(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player');

    const bar = page.locator('div.fixed.top-0').first();

    // Dashboard tab is active on /player.
    await expect(
      bar.getByRole('link', { name: 'Tableau de bord', exact: true })
    ).toHaveAttribute('aria-current', 'page');

    // Mes matchs
    await bar.getByRole('link', { name: 'Mes matchs', exact: true }).click();
    await page.waitForURL(/\/player\/matches$/, { timeout: 10000 });
    await expect(
      bar.getByRole('link', { name: 'Mes matchs', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      bar.getByRole('link', { name: 'Tableau de bord', exact: true })
    ).not.toHaveAttribute('aria-current', 'page');

    // Notifications
    await bar.getByRole('link', { name: 'Notifications', exact: true }).click();
    await page.waitForURL(/\/player\/notifications$/, { timeout: 10000 });
    await expect(
      bar.getByRole('link', { name: 'Notifications', exact: true })
    ).toHaveAttribute('aria-current', 'page');

    // Mon profil
    await bar.getByRole('link', { name: 'Mon profil', exact: true }).click();
    await page.waitForURL(/\/player\/profile$/, { timeout: 10000 });
    await expect(
      bar.getByRole('link', { name: 'Mon profil', exact: true })
    ).toHaveAttribute('aria-current', 'page');
  });

  test('logout signs the player out and returns to the home page', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockPlayerApis(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player');

    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await page.waitForURL(
      (url) => url.pathname === '/' || !url.pathname.startsWith('/player'),
      { timeout: 10000 }
    );
    // Back to a public context: login button visible, player bar gone.
    await expect(page.locator('a:has-text("Connexion")')).toBeVisible({
      timeout: 10000,
    });
  });
});
