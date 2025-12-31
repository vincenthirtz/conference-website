import { test, expect } from '@playwright/test';

const paths = [
  '/',
  '/association',
  '/tournoi',
  '/partenaires',
  '/don',
  '/register',
  '/contact',
  '/timeline-2026',
];

test.describe('Pages publiques', () => {
  for (const path of paths) {
    test(`GET ${path} renvoie du contenu`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator('body')).toBeVisible();
    });
  }
});
