// E2E — « Le Ruban » : les COQUILLES. L'admin a AdminShell
// (features/admin/_shared/shell : barre latérale + fil d'Ariane), l'espace
// joueuse a PlayerShell (features/player/_shared/shell : barre basse sous
// `lg`, rail de 88 px au-dessus) ; jamais les deux sur une même page.
// L'inspection staff d'un espace joueuse (/admin/users/[id]/player-view,
// captain-view) reste sous la coquille et la surface ADMIN.
//
// docs/PLAN-industrialisation-joueur.md (P8) et
// docs/PLAN-industrialisation-admin.md (L12).

import { test, expect, type Page } from '@playwright/test';
import {
  createTestPlayer,
  createTestStaff,
  deleteTestStaff,
  deleteTestUser,
} from '../utils/supabaseTestClient';
import { loginPlayer, skipIfNoServiceRole } from './_helpers/playerSession';
import {
  RUBAN_PASSWORD,
  expectSurface,
  loginStaff,
  mockPlayerDashboardApis,
} from './_helpers/ruban';

const PLAYER_EMAIL = 'hirtzvincent+rubanshellplayer@gmail.com';
const STAFF_EMAIL = 'hirtzvincent+rubanshellstaff@gmail.com';
const PLAYER_NAV = 'Navigation de l’espace joueuse';
const ADMIN_NAV = 'Navigation de l’administration';
const CRUMB = 'Fil d’Ariane';
const ENTRIES = [
  ['Accueil', '/player'],
  ['Équipe', '/player/manage-team'],
  ['Matchs', '/player/matches'],
  ['TCG', '/player/tcg'],
] as const;

let playerId = '';

const playerNav = (page: Page) =>
  page.getByRole('navigation', { name: PLAYER_NAV });

async function expectAdminShell(page: Page) {
  await expect(
    page.getByRole('navigation', { name: ADMIN_NAV }).first()
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('navigation', { name: CRUMB })).toBeVisible();
  await expect(playerNav(page)).toHaveCount(0);
  await expect(page.locator('[data-player-nav]')).toHaveCount(0);
}

test.describe('Le Ruban — coquilles admin et joueuse', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestUser(PLAYER_EMAIL);
    await deleteTestStaff(STAFF_EMAIL);
    const player = await createTestPlayer(PLAYER_EMAIL, RUBAN_PASSWORD);
    playerId = player!.id;
    await createTestStaff(STAFF_EMAIL, RUBAN_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('joueuse < lg : barre BASSE, 4 entrées ≥ 44×44, pas de coquille admin', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await page.setViewportSize({ width: 375, height: 812 });
    await mockPlayerDashboardApis(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player', RUBAN_PASSWORD);
    await page.goto('/player');
    await expectSurface(page, 'player');

    const nav = playerNav(page);
    await expect(nav).toBeVisible({ timeout: 20000 });
    const box = await nav.boundingBox();
    // Collée en bas de l'écran, sur toute la largeur.
    expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(812 - 1);
    expect(Math.round(box!.width)).toBe(375);

    const links = nav.getByRole('link');
    await expect(links).toHaveCount(ENTRIES.length);
    for (const [label, href] of ENTRIES) {
      const link = nav.getByRole('link', { name: label, exact: true });
      await expect(link).toHaveAttribute('href', href);
      const b = await link.boundingBox();
      expect(b!.width, `${label} : largeur`).toBeGreaterThanOrEqual(44);
      expect(b!.height, `${label} : hauteur`).toBeGreaterThanOrEqual(44);
    }
    await expect(
      nav.getByRole('link', { name: 'Accueil', exact: true })
    ).toHaveAttribute('aria-current', 'page');

    // Le dernier bloc ne passe pas sous la barre : le corps réserve sa place.
    const pad = await page.evaluate(
      () => parseFloat(getComputedStyle(document.body).paddingBottom) || 0
    );
    expect(pad).toBeGreaterThanOrEqual(Math.floor(box!.height) - 1);

    await expect(page.getByRole('navigation', { name: ADMIN_NAV })).toHaveCount(
      0
    );
    await expect(page.getByRole('navigation', { name: CRUMB })).toHaveCount(0);
  });

  test('joueuse ≥ lg : RAIL latéral de 88 px, l’entrée active suit la page', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockPlayerDashboardApis(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player/matches', RUBAN_PASSWORD);
    await page.goto('/player/matches');
    await expectSurface(page, 'player');

    const nav = playerNav(page);
    await expect(nav).toBeVisible({ timeout: 20000 });
    const box = await nav.boundingBox();
    expect(Math.round(box!.x)).toBe(0);
    expect(Math.round(box!.width)).toBe(88);
    expect(box!.height).toBeGreaterThan(400);
    await expect(
      nav.getByRole('link', { name: 'Matchs', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    const padLeft = await page.evaluate(
      () => getComputedStyle(document.body).paddingLeft
    );
    expect(padLeft).toBe('88px');
    await expect(page.getByRole('navigation', { name: ADMIN_NAV })).toHaveCount(
      0
    );
  });

  test('admin : AdminShell (barre latérale + fil d’Ariane), jamais la nav joueuse', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginStaff(page, STAFF_EMAIL);
    await page.goto('/admin');
    await expectSurface(page, 'admin');
    await expectAdminShell(page);
    // Barre latérale à la largeur du jeton de coquille (--admin-sidebar-w).
    const aside = page.locator('aside').filter({
      has: page.getByRole('navigation', { name: ADMIN_NAV }),
    });
    const box = await aside.boundingBox();
    expect(Math.round(box!.width)).toBe(236);
  });

  for (const view of ['player-view', 'captain-view'] as const) {
    test(`inspection ${view} : coquille et surface ADMIN, pas de barre basse joueuse`, async ({
      page,
    }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
      await loginStaff(page, STAFF_EMAIL);
      for (const width of [1280, 375]) {
        await test.step(`${width} px`, async () => {
          await page.setViewportSize({ width, height: 812 });
          await page.goto(`/admin/users/${playerId}/${view}`);
          expect(new URL(page.url()).pathname).toBe(
            `/admin/users/${playerId}/${view}`
          );
          await expectSurface(page, 'admin');
          if (width >= 1024) {
            await expectAdminShell(page);
          } else {
            // Sous lg : la barre latérale se replie dans un tiroir ; le bouton
            // de menu admin est là, la barre basse joueuse ne l'est pas.
            await expect(
              page.getByRole('button', { name: 'Ouvrir le menu' }).first()
            ).toBeVisible({ timeout: 20000 });
            await expect(playerNav(page)).toHaveCount(0);
            await expect(page.locator('[data-player-nav]')).toHaveCount(0);
          }
        });
      }
    });
  }
});
