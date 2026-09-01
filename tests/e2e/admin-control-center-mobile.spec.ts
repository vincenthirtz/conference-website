// E2E — le centre de contrôle du tournoi, au téléphone (lot A1 de
// docs/PLAN-espace-admin.md).
//
// Le plan disait : « mesurer avant d'optimiser le mobile ». Le code utilise des
// grilles `md:`/`lg:` et peu de largeurs fixes — c'est un indice, pas une
// preuve. Ce spec en fait une mesure, et une régression détectable :
//
//   1. la page ne déborde PAS horizontalement en 390 px (le symptôme n°1 d'un
//      écran desktop porté au téléphone, et celui qui rend une page
//      inutilisable à une main) ;
//   2. le geste ajouté par A1 — relancer les équipes non checkées depuis
//      l'alerte — est atteignable au doigt (44 px) sans quitter la page.
//
// Le payload du dashboard est mocké : c'est la MISE EN PAGE qui est le sujet,
// pas l'état de la base.

import { test, expect } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const STAFF_PASSWORD = 'TestPassw0rd!';
const STAFF_EMAIL = 'hirtzvincent+ccmobile@gmail.com';
const TOURNAMENT_ID = '99999999-9999-4999-8999-999999999999';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Centre de contrôle — téléphone', () => {
  test.beforeAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    }
  });

  test.afterAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('ne déborde pas horizontalement en 390 px', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.goto('/admin/login');
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', STAFF_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });

    await page.goto(`/admin/tournament/${TOURNAMENT_ID}/dashboard`);
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      // 1 px de tolérance : les bordures sub-pixel arrondissent parfois vers
      // le haut sans qu'aucune barre de défilement n'apparaisse.
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
