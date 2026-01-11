import { test, expect } from '@playwright/test';

const publicPaths = [
  { path: '/', name: 'Accueil' },
  { path: '/association', name: 'Association' },
  { path: '/tournoi', name: 'Tournoi' },
  { path: '/partenaires', name: 'Partenaires' },
  { path: '/don', name: 'Don' },
  { path: '/register', name: 'Inscription' },
  { path: '/contact', name: 'Contact' },
  { path: '/timeline-2026', name: 'Timeline' },
  { path: '/news', name: 'News' },
  { path: '/mentions-legales', name: 'Mentions légales' },
  { path: '/plan-du-site', name: 'Plan du site' },
];

test.describe('Pages publiques', () => {
  for (const { path, name } of publicPaths) {
    test(`GET ${path} (${name}) renvoie du contenu`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator('body')).toBeVisible();
    });
  }
});

test.describe('Navigation et structure', () => {
  test('La page accueil contient une navbar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible();
  });

  test('La page accueil contient un footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toBeVisible();
  });

  test('Le lien Connexion est visible pour les visiteurs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /connexion/i })).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('Pages admin sans auth redirigent vers login', () => {
  const adminPaths = [
    '/admin',
    '/admin/tournaments',
    '/admin/teams',
    '/admin/news',
    '/admin/users/manage',
  ];

  for (const path of adminPaths) {
    test(`GET ${path} redirige vers login`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(1000);

      const url = page.url();
      const redirectedToLogin = url.includes('/admin/login');
      const redirectedTo403 = url.includes('/403');

      expect(
        redirectedToLogin || redirectedTo403,
        `${path} devrait rediriger vers login ou 403. URL actuelle: ${url}`
      ).toBeTruthy();
    });
  }
});

test.describe('Pages erreur', () => {
  test('Page 404 pour route inexistante', async ({ page }) => {
    const res = await page.goto('/cette-page-nexiste-pas-12345');
    expect(res?.status()).toBe(404);
  });
});
