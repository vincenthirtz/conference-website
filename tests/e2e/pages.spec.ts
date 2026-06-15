import { test, expect } from '@playwright/test';

type PublicPage = {
  path: string;
  name: string;
  /** A piece of text that must appear on the page (case-insensitive). */
  contains: RegExp;
};

const publicPages: PublicPage[] = [
  { path: '/', name: 'Accueil', contains: /OW WOMEN[’']?S CUP/i },
  { path: '/association', name: 'Association', contains: /association/i },
  { path: '/tournoi', name: 'Tournoi', contains: /tournoi/i },
  { path: '/partenaires', name: 'Partenaires', contains: /partenaire/i },
  {
    path: '/partenaires/demande',
    name: 'Demande de partenariat',
    contains: /partenariat|demande/i,
  },
  { path: '/don', name: 'Don', contains: /don|soutenir/i },
  {
    path: '/register',
    name: 'Inscription',
    contains: /inscri|cr[ée]er.*compte/i,
  },
  { path: '/contact', name: 'Contact', contains: /contact/i },
  { path: '/timeline-2026', name: 'Timeline', contains: /timeline|2026/i },
  { path: '/actualites', name: 'Actualités', contains: /actualit/i },
  {
    path: '/mentions-legales',
    name: 'Mentions légales',
    contains: /mentions.*l[ée]gales|directeur|publication/i,
  },
  { path: '/plan-du-site', name: 'Plan du site', contains: /plan du site/i },
  { path: '/rules', name: 'Règlement', contains: /r[èe]glement/i },
  { path: '/about', name: 'À propos', contains: /[àa]\s+propos|qui sommes/i },
];

test.describe('Pages publiques — disponibilité et contenu', () => {
  for (const { path, name, contains } of publicPages) {
    test(`GET ${path} (${name}) — répond 2xx/3xx et affiche son contenu`, async ({
      page,
    }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} should not 4xx/5xx`).toBeLessThan(400);
      // Real assertion on rendered content — the body must contain the
      // expected page-specific text rather than just being non-empty.
      await expect(
        page.locator('body').getByText(contains).first()
      ).toBeVisible({ timeout: 10000 });
    });
  }
});

test.describe('Navbar et footer', () => {
  test('La page accueil affiche un footer (data-test) et un lien Connexion', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /connexion/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('[data-test="footer"]')).toBeVisible({
      timeout: 10000,
    });
  });

  test('Le skip-link "Aller au contenu principal" est présent (a11y)', async ({
    page,
  }) => {
    await page.goto('/');
    // Skip link is sr-only by default but exists in the DOM
    await expect(
      page.getByRole('link', { name: /Aller au contenu principal/i })
    ).toBeAttached();
  });
});

test.describe('Pages admin sans auth — redirection ou 403', () => {
  const adminPaths = [
    '/admin',
    '/admin/tournaments',
    '/admin/teams',
    '/admin/news',
    '/admin/users/manage',
    '/admin/cast-members',
    '/admin/cast-members/new',
    '/admin/partners',
    '/admin/partners/new',
    '/admin/partnership-requests',
  ];

  for (const path of adminPaths) {
    test(`GET ${path} redirige vers login ou 403`, async ({ page }) => {
      await page.goto(path);
      // Wait for the URL to settle on a login or 403 page rather than
      // sleeping arbitrarily — withStaffPage redirects via SSR.
      await page.waitForURL(/\/login|\/403/, { timeout: 10000 });
      const url = page.url();
      const ok = url.includes('/login') || url.includes('/403');
      expect(
        ok,
        `${path} devrait rediriger vers /login ou /403. URL: ${url}`
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

test.describe('Sitemap et RSS', () => {
  test('GET /sitemap.xml répond en XML', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('xml');
    const body = await res.text();
    expect(body).toContain('<urlset');
  });

  test('GET /api/news/rss répond en RSS/XML', async ({ request }) => {
    const res = await request.get('/api/news/rss');
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toMatch(/xml|rss/);
  });
});
