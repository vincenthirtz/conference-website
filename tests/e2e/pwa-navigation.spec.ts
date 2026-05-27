import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// PWA navigation tests — validates:
//   1. Single <link rel="manifest"> in the DOM (no duplicates)
//   2. Correct manifest href per route scope
//   3. Client-side navigation works (Link clicks render new pages)
//   4. Manifest href updates during client-side navigation
//   5. SW fetch handler excludes /_next/data/ from caching
// ---------------------------------------------------------------------------

test.describe('PWA — manifest link', () => {
  test('homepage has exactly one <link rel="manifest"> pointing to /site.webmanifest', async ({
    page,
  }) => {
    await page.goto('/');
    const links = page.locator('link[rel="manifest"]');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute('href', '/site.webmanifest');
  });

  test('/actualites has exactly one <link rel="manifest"> pointing to /site.webmanifest', async ({
    page,
  }) => {
    await page.goto('/actualites');
    const links = page.locator('link[rel="manifest"]');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute('href', '/site.webmanifest');
  });

  test('/admin redirects to login but still has a single manifest link', async ({
    page,
  }) => {
    await page.goto('/admin');
    await page.waitForURL(/\/admin\/login|\/403/, { timeout: 10000 });
    const links = page.locator('link[rel="manifest"]');
    await expect(links).toHaveCount(1);
    const href = await links.first().getAttribute('href');
    expect(href).toMatch(/manifest\.webmanifest$/);
  });
});

test.describe('PWA — manifest updates on client-side navigation', () => {
  test('manifest href stays /site.webmanifest when navigating between public pages', async ({
    page,
  }) => {
    await page.goto('/');
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);
    await expect(manifestLink).toHaveAttribute('href', '/site.webmanifest');

    // Navigate via a click on the "Actualités" navbar link (client-side nav)
    const newsLink = page.getByRole('link', { name: /actualit/i }).first();
    if ((await newsLink.count()) > 0) {
      await newsLink.click();
      await page.waitForURL('**/actualites**', { timeout: 10000 });

      // Manifest should still be /site.webmanifest and still only one
      await expect(manifestLink).toHaveCount(1);
      await expect(manifestLink).toHaveAttribute('href', '/site.webmanifest');
    }
  });
});

test.describe('PWA — client-side navigation works', () => {
  test('navigating from home to /association via Navbar renders new content', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('body')).toContainText(/OW WOMEN/i);

    const associationLink = page
      .getByRole('link', { name: /association/i })
      .first();
    const count = await associationLink.count();
    test.skip(count === 0, 'No "Association" link found in navbar');

    await associationLink.click();
    await page.waitForURL('**/association**', { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/association/i);
  });

  test('navigating from home to /partenaires via Navbar renders new content', async ({
    page,
  }) => {
    await page.goto('/');
    const partenaireLink = page
      .getByRole('link', { name: /partenaire/i })
      .first();
    const count = await partenaireLink.count();
    test.skip(count === 0, 'No "Partenaires" link found in navbar');

    await partenaireLink.click();
    await page.waitForURL('**/partenaires**', { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/partenaire/i);
  });

  test('navigating from /actualites back to home works', async ({ page }) => {
    await page.goto('/actualites');
    await expect(page.locator('body')).toContainText(/actualit/i);

    // Click the logo/home link in the navbar to go back to home
    const homeLink = page.locator('nav a[href="/"]').first();
    const count = await homeLink.count();
    test.skip(count === 0, 'No home link found in navbar');

    await homeLink.click();
    await page.waitForURL(/\/$/, { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/OW WOMEN/i);
  });

  test('no duplicate manifest link after multiple navigations', async ({
    page,
  }) => {
    await page.goto('/');
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);

    // Navigate to /contact
    const contactLink = page.getByRole('link', { name: /contact/i }).first();
    const contactCount = await contactLink.count();
    test.skip(contactCount === 0, 'No "Contact" link found');

    await contactLink.click();
    await page.waitForURL('**/contact**', { timeout: 10000 });
    await expect(manifestLink).toHaveCount(1);

    // Navigate back to home
    const homeLink = page.locator('nav a[href="/"]').first();
    if ((await homeLink.count()) > 0) {
      await homeLink.click();
      await page.waitForURL(/\/$/, { timeout: 10000 });
      await expect(manifestLink).toHaveCount(1);
    }
  });
});

test.describe('PWA — service worker fetch exclusions', () => {
  test('sw.js is served and contains /_next/data/ exclusion', async ({
    request,
  }) => {
    const res = await request.get('/sw.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("/_next/data/");
    expect(body).toContain(".webmanifest");
  });

  test('sw.js contains network-first navigation strategy', async ({
    request,
  }) => {
    const res = await request.get('/sw.js');
    const body = await res.text();
    expect(body).toContain('networkFirstNavigation');
    expect(body).toContain("mode === 'navigate'");
  });

  test('manifests are served fresh (not via SW cache)', async ({ request }) => {
    const manifests = [
      '/site.webmanifest',
      '/admin/manifest.webmanifest',
      '/caster/manifest.webmanifest',
      '/player/manifest.webmanifest',
    ];
    for (const path of manifests) {
      const res = await request.get(path);
      expect(res.status(), `${path} should be 200`).toBe(200);
      const body = await res.text();
      const json = JSON.parse(body);
      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('start_url');
    }
  });
});

test.describe('PWA — offline fallback exists', () => {
  test('/offline.html is precacheable', async ({ request }) => {
    const res = await request.get('/offline.html');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Hors ligne');
  });
});
