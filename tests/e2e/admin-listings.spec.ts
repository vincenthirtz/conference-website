import { test, expect, type Page } from '@playwright/test';
import {
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const TEST_PASSWORD = 'TestPassw0rd!';
const ADMIN_EMAIL = 'hirtzvincent+e2e-listings@gmail.com';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input#email', ADMIN_EMAIL);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

/**
 * Each entry describes an admin listing page that hit the
 * "Session staff manquante / Chargement... figé" regression. The selectors
 * here look for the loaded state of the listing, NOT a generic page heading
 * — that's the only way to catch the regression where the page renders but
 * the data fetch silently bails.
 */
const LISTING_PAGES = [
  {
    label: 'Users manage',
    url: '/admin/users/manage',
    heading: /Gestion des inscrits/i,
    // After load, the count switches from "Chargement..." to "X utilisateur(s)"
    loadedSignal: /\d+\s+utilisateur/i,
  },
  {
    label: 'Adherents',
    url: '/admin/adherents',
    heading: /Gestion des adhérents/i,
    loadedSignal: /\d+\s+adhérent/i,
  },
  {
    label: 'Announcements',
    url: '/admin/announcements',
    heading: /Gestion des annonces/i,
    loadedSignal: null,
  },
  {
    label: 'News',
    url: '/admin/news',
    heading: /Gestion des news/i,
    loadedSignal: null,
  },
  {
    label: 'Partners',
    url: '/admin/partners',
    heading: /Gestion des partenaires/i,
    loadedSignal: null,
  },
  {
    label: 'Cast members',
    url: '/admin/cast-members',
    heading: /Pôle Production/i,
    loadedSignal: null,
  },
] as const;

async function expectListingLoaded(
  page: Page,
  spec: (typeof LISTING_PAGES)[number]
) {
  await expect(
    page.getByRole('heading', { name: spec.heading })
  ).toBeVisible({ timeout: 15000 });

  if (spec.loadedSignal) {
    // The header shows "Chargement..." while total === null. Once the
    // fetch completes, it switches to "<n> utilisateur(s)" / "<n> adhérent(s)".
    // Asserting that pattern catches the regression where fetchData silently
    // bailed on a missing client token, leaving the count stuck on
    // "Chargement..." indefinitely.
    await expect(page.getByText(spec.loadedSignal).first()).toBeVisible({
      timeout: 15000,
    });
  }

  // No error toast / message about the missing staff session should be
  // visible — that is the exact symptom of the regression.
  await expect(page.getByText(/Session staff (manquante|introuvable)/i))
    .toHaveCount(0);
}

test.describe.serial('Admin listings load reliably', () => {
  test.beforeAll(async () => {
    await deleteTestStaff(ADMIN_EMAIL);
    await createTestStaff(ADMIN_EMAIL, TEST_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    await deleteTestStaff(ADMIN_EMAIL);
  });

  for (const spec of LISTING_PAGES) {
    test(`${spec.label} listing renders data after first navigation`, async ({
      page,
    }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      await loginAsAdmin(page);
      await page.goto(spec.url);
      await expectListingLoaded(page, spec);
    });
  }

  test('Users manage listing still loads after a hard reload', async ({
    page,
  }) => {
    // Reproduces the cookie-hardening regression: on the second visit, the
    // server may have refreshed the auth cookie via Set-Cookie. If those
    // cookies were forced HttpOnly, the browser client lost the session and
    // every admin fetch bailed silently with "Session staff manquante".
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    const spec = LISTING_PAGES[0];
    await page.goto(spec.url);
    await expectListingLoaded(page, spec);

    await page.reload();
    await expectListingLoaded(page, spec);
  });

  test('Auth cookies sb-* remain readable from document.cookie', async ({
    page,
  }) => {
    // Direct assertion of the contract pinned by the unit test in
    // tests/unit/supabaseClients.test.ts: the browser client (createBrowserClient)
    // reads cookies via document.cookie, so the sb-*-auth-token cookies must
    // not be HttpOnly. If a future change re-hardens them, every admin
    // listing breaks and this test catches it.
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/users/manage');
    await expectListingLoaded(page, LISTING_PAGES[0]);

    const sbCookies = await page.evaluate(() =>
      document.cookie
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c.startsWith('sb-'))
    );

    expect(
      sbCookies.length,
      'Expected at least one sb-* cookie to be readable from document.cookie. ' +
        'If this is empty, it means the auth cookies were marked HttpOnly ' +
        '(or absent), which silently breaks every admin listing.'
    ).toBeGreaterThan(0);
  });

  test('Listing recovers when sb-* auth cookies are forced HttpOnly (regression simulation)', async ({
    page,
    context,
  }) => {
    // Reproduces the user-reported regression directly. In a fresh login the
    // browser client sets sb-* cookies WITHOUT HttpOnly. But once the server
    // refreshes the session and writes them back via Set-Cookie, the (old)
    // hardenCookieOptions used to force HttpOnly. From that point on
    // supabaseClient.auth.getSession() returns null on the client and every
    // admin fetch that bails on a missing token shows
    // "Aucun utilisateur trouvé" with the count stuck on "Chargement...".
    //
    // We simulate that bad state by re-setting all sb-* cookies as HttpOnly
    // via the DevTools protocol (Playwright bypasses the JS-readable
    // restriction), reloading, and asserting the listing still loads. With
    // the cookie-name-aware hardening + the defensive cookie-auth fallback,
    // the page must keep working.
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/users/manage');
    await expectListingLoaded(page, LISTING_PAGES[0]);

    const allCookies = await context.cookies();
    const sbCookies = allCookies.filter((c) => c.name.startsWith('sb-'));
    expect(
      sbCookies.length,
      'Expected at least one sb-* cookie after login'
    ).toBeGreaterThan(0);

    // addCookies() overwrites existing cookies with the same name+domain+path.
    await context.addCookies(
      sbCookies.map((c) => ({ ...c, httpOnly: true }))
    );

    await page.reload();
    await expectListingLoaded(page, LISTING_PAGES[0]);
  });
});
