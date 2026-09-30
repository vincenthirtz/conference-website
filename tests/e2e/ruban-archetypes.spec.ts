// E2E — « Le Ruban » : les ARCHÉTYPES de l'espace joueuse
// (features/player/_shared/ui : FilView, FicheView, ListeView,
// CollectionView), mobile d'abord. Un écran réellement branché par archétype :
//   FIL        /player            (tableau de bord)
//   FICHE      /player/profile
//   LISTE      /player/teams      (annuaire des équipes)
//   COLLECTION /player/tcg
// À 375 px, chacun rend ses repères (titre h1 unique, `main`, région
// `aria-live` pour ses annonces, navigation de la coquille), ne défile pas
// horizontalement, et ses onglets éventuels respectent la cible de 44 px.
//
// docs/PLAN-industrialisation-joueur.md (P7/P8, archétypes).

import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import { skipIfNoServiceRole } from './_helpers/playerSession';
import {
  RUBAN_PASSWORD,
  loginRubanPlayer,
  expectSurface,
  hasHorizontalOverflow,
  mockPlayerDashboardApis,
} from './_helpers/ruban';

const PLAYER_EMAIL = 'hirtzvincent+rubanarchetypes@gmail.com';
const PLAYER_NAV = 'Navigation de l’espace joueuse';

const SCREENS = [
  { archetype: 'FIL', route: '/player' },
  { archetype: 'FICHE', route: '/player/profile' },
  { archetype: 'LISTE', route: '/player/teams' },
  { archetype: 'COLLECTION', route: '/player/tcg' },
] as const;

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Le Ruban — archétypes joueuse à 375 px', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestUser(PLAYER_EMAIL);
    await createTestPlayer(PLAYER_EMAIL, RUBAN_PASSWORD);
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  for (const { archetype, route } of SCREENS) {
    test(`${archetype} (${route}) : repères, annonces, aucun débordement`, async ({
      page,
    }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
      if (route === '/player') await mockPlayerDashboardApis(page);
      await loginRubanPlayer(page, PLAYER_EMAIL, route);
      await page.goto(route);
      expect(new URL(page.url()).pathname).toBe(route);
      await expectSurface(page, 'player');

      // Repères : un seul titre de page, dans le contenu principal.
      const h1 = page.locator('main h1');
      await expect(h1.first()).toBeVisible({ timeout: 20000 });
      await expect(page.locator('h1:visible')).toHaveCount(1);
      await expect(
        page.getByRole('navigation', { name: PLAYER_NAV })
      ).toBeVisible();

      // Les mises à jour de l'écran sont annoncées poliment.
      expect(
        await page.locator('main [aria-live="polite"]').count(),
        'région aria-live dans le contenu'
      ).toBeGreaterThan(0);

      // Laisse l'écran finir de charger (squelette → contenu) avant de mesurer.
      await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0, {
        timeout: 20000,
      });
      await page
        .waitForLoadState('networkidle', { timeout: 5000 })
        .catch(() => {});

      const o = await hasHorizontalOverflow(page);
      expect(
        o.overflow,
        `débordement horizontal : scrollWidth ${o.scrollWidth} > ${o.clientWidth}`
      ).toBe(false);

      // Onglets éventuels : cible tactile de la densité joueuse.
      const tabs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main [role="tab"]'))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              text: (el.textContent ?? '').trim(),
              h: r.height,
              w: r.width,
            };
          })
          .filter((t) => t.w > 0)
      );
      for (const tab of tabs) {
        expect(tab.h, `onglet « ${tab.text} »`).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
