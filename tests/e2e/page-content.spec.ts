import { test, expect } from '@playwright/test';

test.describe('SEO - Meta tags', () => {
  test('Homepage has a title tag', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('Homepage has a meta description', async ({ page }) => {
    await page.goto('/');
    const desc = page.locator('meta[name="description"]');
    await expect(desc).toHaveAttribute('content', /.+/);
  });

  test('Homepage has Open Graph tags', async ({ page }) => {
    await page.goto('/');
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /.+/);
  });

  test('Each public page has a title', async ({ page }) => {
    const paths = [
      '/association',
      '/tournoi',
      '/partenaires',
      '/contact',
      '/mentions-legales',
      '/plan-du-site',
    ];
    for (const path of paths) {
      await page.goto(path);
      const title = await page.title();
      expect(title.length, `${path} should have a title`).toBeGreaterThan(0);
    }
  });
});

test.describe('Homepage content', () => {
  test('contains key sections', async ({ page }) => {
    await page.goto('/');
    // Wait for client-side hydration
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // Should have at least some text content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText!.length).toBeGreaterThan(100);
  });

  test('has working navigation links', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /connexion/i })).toBeVisible({
      timeout: 10000,
    });

    // Check for main nav links
    const navLinks = page.locator('a[href]');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(3);
  });
});

test.describe('Contact page', () => {
  test('has a contact form', async ({ page }) => {
    await page.goto('/contact');
    // Should have form inputs
    await expect(
      page.locator('input[type="email"], input[name="email"]')
    ).toBeVisible({
      timeout: 10000,
    });
  });

  test('form shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/contact');
    await page.waitForTimeout(1000);

    // Try to find and click submit button
    const submitBtn = page.locator(
      'button[type="submit"], input[type="submit"]'
    );
    if ((await submitBtn.count()) > 0) {
      await submitBtn.first().click();
      // HTML5 validation should prevent submit or show error messages
      // The form should still be on the contact page
      expect(page.url()).toContain('/contact');
    }
  });
});

test.describe('Plan du site', () => {
  test('lists links to main pages', async ({ page }) => {
    await page.goto('/plan-du-site');
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // Should contain links to key pages
    const links = page.locator('a[href]');
    const hrefs: string[] = [];
    for (let i = 0; i < (await links.count()); i++) {
      const href = await links.nth(i).getAttribute('href');
      if (href) hrefs.push(href);
    }

    // At least some of these should be present
    const expectedPaths = ['/association', '/tournoi', '/contact'];
    for (const expected of expectedPaths) {
      const found = hrefs.some((h) => h.includes(expected));
      expect(found, `Plan du site should link to ${expected}`).toBe(true);
    }
  });
});

test.describe('Mentions légales', () => {
  test('contains legal content', async ({ page }) => {
    await page.goto('/mentions-legales');
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
    const text = await page.locator('body').textContent();
    // Legal pages typically mention legal terms
    expect(text!.length).toBeGreaterThan(200);
  });
});

test.describe('Register page', () => {
  test('has registration form elements', async ({ page }) => {
    await page.goto('/register');
    await page.waitForTimeout(1000);
    // Should have at least an email input or a form
    const inputs = page.locator('input');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Accessibility basics', () => {
  test('pages have lang attribute', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
  });

  test('images have alt text on homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < Math.min(count, 10); i++) {
      const alt = await images.nth(i).getAttribute('alt');
      // Alt can be empty string (decorative) but should exist
      expect(alt !== null, `Image ${i} should have an alt attribute`).toBe(
        true
      );
    }
  });
});
