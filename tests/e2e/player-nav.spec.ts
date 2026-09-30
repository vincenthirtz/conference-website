// E2E — PlayerTopBar (components/Navbar/PlayerTopBar.tsx) + navigation de la
// coquille joueuse (features/player/_shared/shell/PlayerNav.tsx, lot P8).
//
// The fixed top-bar shown to a signed-in non-staff user on /player routes:
//   - 4 tabs (Tableau de bord / Mes matchs / Notifications / Mon profil),
//   - active tab highlight driven by pathname,
//   - logout button → signs out and lands on /.
// The shell navigation: bottom bar under `lg` (Accueil / Équipe / Matchs /
// TCG, targets ≥ 44 px), side rail from `lg`, never on the public site.
// Also run by the `mobile` Playwright project (Pixel 7).
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
const SHELL_NAV = 'Navigation de l’espace joueuse';
const SHELL_ENTRIES = [
  ['Accueil', '/player'],
  ['Équipe', '/player/manage-team'],
  ['Matchs', '/player/matches'],
  ['TCG', '/player/tcg'],
] as const;

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
    // Ni la navigation basse de la coquille joueuse.
    await expect(page.getByRole('navigation', { name: SHELL_NAV })).toHaveCount(
      0
    );
  });

  test('signed-in player sees the top-bar with the 4 tabs', async ({
    page,
    isMobile,
  }) => {
    // Onglets et déconnexion en ligne : barre desktop (≥ 900 px). Le projet
    // `mobile` couvre le menu hamburger et la navigation basse.
    test.skip(isMobile, 'barre desktop uniquement');
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
    isMobile,
  }) => {
    // Onglets et déconnexion en ligne : barre desktop (≥ 900 px). Le projet
    // `mobile` couvre le menu hamburger et la navigation basse.
    test.skip(isMobile, 'barre desktop uniquement');
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

  test('mobile: hamburger opens the menu and a tab navigates', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await page.setViewportSize({ width: 375, height: 800 });
    await mockPlayerApis(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player');

    const bar = page.locator('div.fixed.top-0').first();

    // On mobile the inline tabs collapse; the hamburger toggle is present.
    const hamburger = bar.getByRole('button', { name: 'Ouvrir le menu' });
    await expect(hamburger).toBeVisible({ timeout: 10000 });

    // The inline desktop "Déconnexion" button is hidden at this width.
    await expect(bar.getByRole('button', { name: 'Déconnexion' })).toBeHidden();

    // Open the panel → the player tabs become reachable.
    await hamburger.click();
    const menu = bar.getByRole('menu');
    await expect(
      menu.getByRole('menuitem', { name: 'Mes matchs', exact: true })
    ).toBeVisible();

    // Navigate via a tab in the panel.
    await menu
      .getByRole('menuitem', { name: 'Mes matchs', exact: true })
      .click();
    await page.waitForURL(/\/player\/matches$/, { timeout: 10000 });

    // Panel closes on navigation; the bell stays visible outside the menu.
    await expect(
      page.getByRole('link', { name: /Notifications \(/ })
    ).toBeVisible();
  });

  test('logout signs the player out and returns to the home page', async ({
    page,
    isMobile,
  }) => {
    // Onglets et déconnexion en ligne : barre desktop (≥ 900 px). Le projet
    // `mobile` couvre le menu hamburger et la navigation basse.
    test.skip(isMobile, 'barre desktop uniquement');
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

  test('mobile: bottom nav (4 entries ≥ 44 px) navigates and marks the page', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await page.setViewportSize({ width: 375, height: 800 });
    await mockPlayerApis(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player');

    const nav = page.getByRole('navigation', { name: SHELL_NAV });
    await expect(nav).toBeVisible({ timeout: 10000 });
    const navBox = await nav.boundingBox();
    // Collée en bas de l'écran (barre du pouce).
    expect(navBox && navBox.y + navBox.height).toBeGreaterThan(760);

    for (const [name, href] of SHELL_ENTRIES) {
      const link = nav.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', href);
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(
      nav.getByRole('link', { name: 'Accueil', exact: true })
    ).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('link', { name: 'Matchs', exact: true }).click();
    await page.waitForURL(/\/player\/matches$/, { timeout: 10000 });
    await expect(
      nav.getByRole('link', { name: 'Matchs', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      nav.getByRole('link', { name: 'Accueil', exact: true })
    ).not.toHaveAttribute('aria-current', 'page');

    // Focus visible au CLAVIER sur une entrée. Un `.focus()` programmatique
    // juste après un clic souris ne déclenche pas :focus-visible (heuristique
    // de modalité de Chromium) : on arrive sur « TCG » par Tab depuis
    // « Matchs », l'entrée qui la précède.
    await nav.getByRole('link', { name: 'Matchs', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(
      nav.getByRole('link', { name: 'TCG', exact: true })
    ).toBeFocused();
    const outline = await nav
      .getByRole('link', { name: 'TCG', exact: true })
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('desktop: the same navigation becomes a side rail', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'rail : desktop uniquement');
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockPlayerApis(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player');

    const nav = page.getByRole('navigation', { name: SHELL_NAV });
    await expect(nav).toBeVisible({ timeout: 10000 });
    const box = await nav.boundingBox();
    expect(box?.x ?? -1).toBe(0);
    expect(box?.width ?? 0).toBeLessThanOrEqual(96);
    expect(box?.height ?? 0).toBeGreaterThan(400);
    // La barre du haut garde ses onglets.
    const bar = page.locator('div.fixed.top-0').first();
    await expect(
      bar.getByRole('link', { name: 'Tableau de bord', exact: true })
    ).toBeVisible();
  });
});
