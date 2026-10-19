/**
 * Tests E2E — page publique /securite (« Aide et sécurité », Women's Library
 * lot 8a). LECTURE SEULE : aucune requête mutante, rien n'est écrit.
 *
 * Couvre ce qu'un test unitaire ne voit pas :
 *  - la page répond sans compte et porte bien `noindex` dans le <head> rendu ;
 *  - le bouton « Quitter vite » reste visible après défilement ;
 *  - Échap ×2 REMPLACE la page (la navigation vers la page neutre est
 *    interceptée : on ne quitte pas réellement le site pendant le test).
 */
import { test, expect } from '@playwright/test';

const EXIT_HOST = /^https:\/\/www\.google\.com\//;

test.describe('/securite — aide et sécurité', () => {
  test('répond sans compte, noindex, numéros cliquables', async ({ page }) => {
    const res = await page.goto('/securite');
    expect(res?.status()).toBeLessThan(400);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]')
    ).toHaveCount(1);

    for (const href of [
      'tel:17',
      'tel:112',
      'sms:114',
      'tel:3919',
      'tel:3018',
      'tel:119',
      'tel:3114',
    ]) {
      await expect(page.locator(`a[href="${href}"]`)).toHaveCount(1);
    }
  });

  test('« Quitter vite » reste visible en bas de page', async ({ page }) => {
    await page.goto('/securite');
    await page.locator('#sortie-rapide').scrollIntoViewIfNeeded();
    await expect(
      page.locator('a[href^="https://www.google.com"]').first()
    ).toBeInViewport();
  });

  test('Échap ×2 remplace la page par la page neutre', async ({ page }) => {
    // La page neutre n'est jamais chargée : on répond à sa place.
    await page.route(EXIT_HOST, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' })
    );
    await page.goto('/securite');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForURL(EXIT_HOST);
    expect(page.url()).toMatch(EXIT_HOST);
  });
});
