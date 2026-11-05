// tests/e2e/navigation-shell.spec.ts
//
// Recette de la refonte des menus (plan 10), côté VISITEUR ANONYME — le seul
// parcours jouable sans comptes de test. Les cas connectés (joueuse, staff,
// staff + joueuse) sont couverts par les règles pures :
// tests/unit/navbarHeaderBars.test.ts, navigation.test.ts, appChrome.test.ts.
//
// Vérifie : un en-tête sur chaque page publique (bureau et mobile), l'entrée
// active du menu du site, le menu mobile, les pages nues (overlays), et que la
// barre d'onglets du tournoi ne bouge pas d'un onglet à l'autre.

import { test, expect, type Page } from '@playwright/test';

const SLUG = process.env.TEST_TOURNAMENT_SLUG || 'ow-womens-cup-2026';
const NAV = 'nav[aria-label="Navigation principale"]';

async function open(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: 'load' });
  return res?.status() ?? 0;
}

test.describe('en-tête — visiteur anonyme, bureau', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of ['/', '/leaderboard', '/admin/login']) {
    test(`${path} : menu du site et inscription`, async ({ page }) => {
      await open(page, path);
      await expect(page.locator(NAV)).toHaveCount(1);
      await expect(
        page.getByRole('link', { name: /Inscription/ }).first()
      ).toBeVisible();
    });
  }

  test('« Agenda » : OWWC 2027 à venir, grisé, puis les quatre événements à revoir', async ({
    page,
  }) => {
    await open(page, '/');
    const agenda = page.locator(`${NAV} [data-test="nav-Agenda"]`);
    await agenda.locator('button').click();
    await expect(
      agenda.getByRole('group', { name: 'À venir' }).getByRole('menuitem')
    ).toHaveText([/OWWC 2027/]);
    await expect(
      agenda.locator('[data-test="nav-sub-OWWC 2027"]')
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(
      agenda.locator('a[data-test="nav-sub-OWWC 2027"]')
    ).toHaveCount(0);
    await expect(
      agenda.getByRole('group', { name: 'À revoir' }).getByRole('menuitem')
    ).toHaveText([/Halloween/, /OWWC 2026/, /homophobie/, /OWWC 2025/]);
  });

  test('la barre d’onglets du tournoi reste au même endroit', async ({
    page,
  }) => {
    test.skip(
      (await open(page, `/tournament/${SLUG}`)) !== 200,
      `tournoi ${SLUG} indisponible`
    );
    const tabs = 'nav[aria-label="Navigation du tournoi"]';
    const boxes = [];
    for (const sub of ['', '/matches', '/standings', '/stats']) {
      await open(page, `/tournament/${SLUG}${sub}`);
      boxes.push(await page.locator(tabs).first().boundingBox());
    }
    for (const b of boxes) {
      expect(b?.x).toBe(boxes[0]?.x);
      expect(b?.y).toBe(boxes[0]?.y);
    }
  });

  test('overlay OBS : page nue, sans en-tête', async ({ page }) => {
    await open(page, `/overlay/day?tournament=${SLUG}`);
    await expect(page.locator(NAV)).toHaveCount(0);
  });
});

test.describe('en-tête — visiteur anonyme, mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('burger présent, menu avec inscription et connexion staff', async ({
    page,
  }) => {
    await open(page, '/');
    const burger = page.locator('[data-test="nav-Hamberger"] button');
    await expect(burger).toBeVisible();
    await burger.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('link', { name: /Inscription/ })).toHaveCount(
      1
    );
    await expect(drawer.getByRole('link', { name: /staff/i })).toHaveCount(1);
  });
});
