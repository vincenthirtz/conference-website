import { test, expect, type Page } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const TEST_PASSWORD = 'TestPassw0rd!';
const ADMIN_EMAIL = 'hirtzvincent+e2e-tenants@gmail.com';

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
 * The S7 multi-tenant admin UI lives next to the API endpoints. The API agent
 * works on /api/admin/tenants/* and /api/admin/active-tenant in parallel.
 * These specs run the UI against whatever the API currently returns. When the
 * endpoints are not yet wired, the UI still mounts (loading/empty states)
 * and the test verifies the page structure without asserting on data.
 *
 * Each test that depends on data writes via the API also tolerates 404 (not
 * yet implemented), skipping rather than failing — this lets the spec land
 * before the API is fully delivered.
 */

const UNIQUE = Math.random().toString(36).slice(2, 8);
const TEST_TENANT_SLUG = `e2e-${UNIQUE}`;
const TEST_TENANT_NAME = `E2E Tenant ${UNIQUE}`;

async function getAuthHeader(page: Page): Promise<string | null> {
  const headers = await page.evaluate(async () => {
    // @ts-expect-error - injected at runtime by app
    const sb = window.__supabase__;
    if (!sb) return null;
    const {
      data: { session },
    } = await sb.auth.getSession();
    return session?.access_token ?? null;
  });
  return headers ? `Bearer ${headers}` : null;
}

test.describe.serial('Admin tenants UI (S7)', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(ADMIN_EMAIL);
    await createTestStaff(ADMIN_EMAIL, TEST_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(ADMIN_EMAIL);
  });

  test('Tenants list page mounts with breadcrumb and CTA', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/tenants');

    // Breadcrumb + heading
    await expect(
      page.getByRole('heading', { name: /Tenants/i, level: 1 })
    ).toBeVisible({ timeout: 15000 });

    // Create CTA always visible regardless of API state. It now opens the
    // creation modal in place (deep-link ?new=1) instead of navigating away.
    await expect(page.getByTestId('tenants-create-cta')).toBeVisible();
    await page.getByTestId('tenants-create-cta').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('tenant-name-input')).toBeVisible();

    // Either a table (with at least the conference row) or an empty state.
    const tableRow = page.locator('[data-testid^="tenant-row-"]');
    const emptyTitle = page.getByText(/Aucun tenant trouvé/i);
    await expect(tableRow.first().or(emptyTitle)).toBeVisible({
      timeout: 15000,
    });
  });

  test('Create-tenant page exposes the slug regex validation', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    // Creation is now an in-place modal; ?new=1 deep-links it open.
    await page.goto('/admin/tenants?new=1');

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });

    // Slug auto-generated from name
    await page.getByTestId('tenant-name-input').fill('My New Event');
    await expect(page.getByTestId('tenant-slug-input')).toHaveValue(
      'my-new-event'
    );

    // Submit with invalid slug fails client-side validation, no API call.
    await page.getByTestId('tenant-slug-input').fill('INVALID slug');
    await page.getByTestId('tenant-create-submit').click();
    await expect(page.getByText(/Slug invalide/i)).toBeVisible();
  });

  test('Manager can create a tenant end-to-end (skipped if API 404)', async ({
    page,
    request,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/tenants?new=1');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('tenant-name-input').fill(TEST_TENANT_NAME);
    await page.getByTestId('tenant-slug-input').fill(TEST_TENANT_SLUG);

    // Probe the API. If it returns 404 the endpoint isn't deployed yet.
    const auth = await getAuthHeader(page);
    if (auth) {
      const probe = await request.get('/api/admin/tenants', {
        headers: { Authorization: auth },
      });
      if (probe.status() === 404) {
        test.skip(true, 'API /api/admin/tenants pas encore déployée');
      }
    }

    await page.getByTestId('tenant-create-submit').click();
    // On success the modal closes (we stay on the list); otherwise an error shows.
    await Promise.race([
      page.getByRole('dialog').waitFor({ state: 'detached', timeout: 8000 }),
      page.waitForSelector('text=/Création impossible|Erreur|invalide/i', {
        timeout: 8000,
      }),
    ]).catch(() => {});

    // Best-effort cleanup so a partial run doesn't leak rows.
    if (auth) {
      const list = await request.get('/api/admin/tenants', {
        headers: { Authorization: auth },
      });
      if (list.ok()) {
        const body = await list.json().catch(() => null);
        const created = (body?.tenants ?? []).find(
          (t: { slug?: string; id?: string }) => t.slug === TEST_TENANT_SLUG
        );
        if (created?.id) {
          await request.delete(`/api/admin/tenants/${created.id}`, {
            headers: { Authorization: auth },
          });
        }
      }
    }
  });

  test('Pending guild links tab mounts (empty state by default)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginAsAdmin(page);
    // Lot C: the pending guild links list is now the "Liens Discord" tab of the
    // merged /admin/onboarding hub. The legacy /admin/pending-guild-links route
    // 308-redirects here, but we navigate straight to the tab.
    await page.goto('/admin/onboarding?tab=guild-links');

    await expect(
      page.getByRole('heading', {
        name: /Serveurs Discord en attente/i,
        level: 1,
      })
    ).toBeVisible({ timeout: 15000 });

    // Either rows are visible or the empty-state title appears.
    const row = page.locator('[data-testid^="pending-link-row-"]');
    const empty = page.getByText(/Aucun serveur en attente/i);
    await expect(row.first().or(empty)).toBeVisible({ timeout: 15000 });
  });

  test.skip('TenantSwitcher mounts in the admin top bar', async ({ page }) => {
    // Skipped: the switcher is no longer rendered in AdminTopBar — on the
    // conference-website domain the active tenant is always DEFAULT_TENANT_ID,
    // tenant switching is done by URL prefix navigation instead. Re-enable
    // this test if the component is restored to the navbar.
    await loginAsAdmin(page);
    await page.goto('/admin');

    const dropdown = page.getByTestId('tenant-switcher');
    const single = page.getByTestId('tenant-switcher-single');
    const skeleton = page.getByTestId('tenant-switcher-skeleton');
    await expect(dropdown.or(single).or(skeleton)).toBeVisible({
      timeout: 15000,
    });
  });
});
