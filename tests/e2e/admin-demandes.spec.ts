import { test, expect, type Page } from '@playwright/test';
import {
  supabaseTestClient,
  createTestStaff,
  createTestPlayer,
  deleteTestStaff,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TEST_PASSWORD = 'TestPassw0rd!';
const RUN_ID = `${Date.now()}`;
const ADMIN_EMAIL = `hirtzvincent+e2e-demandes-${RUN_ID}@gmail.com`;
const PLAYER_EMAIL = `e2e-demandes-player-${RUN_ID}@test.local`;

// Tag every demande we insert with this prefix in `comment`, so the cleanup
// can wipe them all with a single ilike — the page listing groups all
// demandes globally, not by user, so other test runs can leak in.
const COMMENT_TAG = `__E2E_DEMANDES_${RUN_ID}__`;

type SeededDemande = {
  id: string;
  type: string;
  status: string;
  comment: string;
};

async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.fill('input#email', ADMIN_EMAIL);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

test.describe.serial('Admin demandes page', () => {
  let playerId: string | null = null;
  const seeded: SeededDemande[] = [];

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);

    await createTestStaff(ADMIN_EMAIL, TEST_PASSWORD, 'admin');
    const player = await createTestPlayer(PLAYER_EMAIL, TEST_PASSWORD);
    playerId = player?.id ?? null;
    expect(playerId, 'player user must be created').toBeTruthy();

    // Seed 2 pending + 1 approved + 1 rejected demande, all tagged.
    const inserts = [
      {
        type: 'other',
        status: 'pending',
        user_id: playerId,
        source: 'website',
        comment: `${COMMENT_TAG} pending #1`,
      },
      {
        type: 'other',
        status: 'pending',
        user_id: playerId,
        source: 'website',
        comment: `${COMMENT_TAG} pending #2`,
      },
      {
        type: 'other',
        status: 'approved',
        user_id: playerId,
        source: 'website',
        comment: `${COMMENT_TAG} approved`,
      },
      {
        type: 'other',
        status: 'rejected',
        user_id: playerId,
        source: 'website',
        comment: `${COMMENT_TAG} rejected`,
      },
    ];

    const { data, error } = await supabaseTestClient!
      .from('demandes')
      .insert(inserts)
      .select('id, type, status, comment');
    if (error) throw error;
    for (const row of data || []) {
      seeded.push(row as SeededDemande);
    }
    expect(seeded.length).toBe(4);
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;

    if (playerId) {
      await supabaseTestClient!
        .from('demandes')
        .delete()
        .eq('user_id', playerId);
    }
    // Defensive: also wipe by comment tag in case of stale rows.
    await supabaseTestClient!
      .from('demandes')
      .delete()
      .ilike('comment', `%${COMMENT_TAG}%`);

    await deleteTestUser(PLAYER_EMAIL);
    await deleteTestStaff(ADMIN_EMAIL);
  });

  test('renders stats cards and pending demandes by default', async ({
    page,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/demandes');

    await expect(
      page.getByRole('heading', { name: /Demandes équipes/i })
    ).toBeVisible({ timeout: 15000 });

    // Five stat cards (each is a <button>). The status labels also appear in
    // the dropdown and as row badges, so target the buttons specifically.
    await expect(page.getByRole('button', { name: /Total/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /En attente/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Approuvées/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Refusées/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Annulées/ })
    ).toBeVisible();

    // Default status filter is 'pending', so both pending demandes appear.
    await expect(
      page.getByText(`${COMMENT_TAG} pending #1`)
    ).toBeVisible();
    await expect(
      page.getByText(`${COMMENT_TAG} pending #2`)
    ).toBeVisible();

    // The approved/rejected ones should NOT appear under the default filter.
    await expect(
      page.getByText(`${COMMENT_TAG} approved`)
    ).toHaveCount(0);
    await expect(
      page.getByText(`${COMMENT_TAG} rejected`)
    ).toHaveCount(0);
  });

  test('clicking the "Approuvées" stat card filters by status=approved', async ({
    page,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/demandes');
    await expect(
      page.getByRole('heading', { name: /Demandes équipes/i })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /Approuvées/ }).click();

    await page.waitForURL(/status=approved/, { timeout: 10000 });

    await expect(page.getByText(`${COMMENT_TAG} approved`)).toBeVisible();
    await expect(page.getByText(`${COMMENT_TAG} pending #1`)).toHaveCount(0);
  });

  test('search filter persists in URL and narrows results', async ({
    page,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto('/admin/demandes');
    await expect(
      page.getByRole('heading', { name: /Demandes équipes/i })
    ).toBeVisible({ timeout: 15000 });

    // Use the unique tag — one search term will only match our seeded rows.
    await page.fill('input[placeholder*="Commentaire"]', COMMENT_TAG);
    await page.getByRole('button', { name: /^Rechercher$/ }).click();

    await page.waitForURL(
      new RegExp(`search=${encodeURIComponent(COMMENT_TAG)}`),
      { timeout: 10000 }
    );

    // Default status=pending + search => exactly the 2 pending rows.
    await expect(
      page.getByText(`${COMMENT_TAG} pending #1`)
    ).toBeVisible();
    await expect(
      page.getByText(`${COMMENT_TAG} pending #2`)
    ).toBeVisible();
  });

  test('quick approve action moves a pending demande to approved', async ({
    page,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await loginAsAdmin(page);
    // Filter to our seeded rows only via search + use a wide viewport so the
    // quick-action buttons (hidden on md:hidden) are rendered.
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(
      `/admin/demandes?search=${encodeURIComponent(COMMENT_TAG)}`
    );
    await expect(
      page.getByRole('heading', { name: /Demandes équipes/i })
    ).toBeVisible({ timeout: 15000 });

    const id = seeded.find((d) => d.comment.endsWith('pending #1'))!.id;
    // The row wraps the link in href=/admin/demandes/<id>; the Approuver
    // button sits as a sibling of that link inside the row.
    const targetRow = page
      .locator(`a[href="/admin/demandes/${id}"]`)
      .first()
      .locator('xpath=..');

    await targetRow.getByRole('button', { name: 'Approuver' }).click();

    // After approve, this row should leave the pending list.
    await expect(
      page.getByText(`${COMMENT_TAG} pending #1`)
    ).toHaveCount(0, { timeout: 10000 });

    // The other pending row is still there.
    await expect(
      page.getByText(`${COMMENT_TAG} pending #2`)
    ).toBeVisible();

    // DB is updated.
    const { data } = await supabaseTestClient!
      .from('demandes')
      .select('status, processed_at')
      .eq('id', id)
      .maybeSingle();
    expect(data?.status).toBe('approved');
    expect(data?.processed_at).toBeTruthy();
  });

  test('reset button clears active filters', async ({ page }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await loginAsAdmin(page);
    await page.goto(
      `/admin/demandes?status=approved&search=${encodeURIComponent(COMMENT_TAG)}`
    );
    await expect(
      page.getByRole('heading', { name: /Demandes équipes/i })
    ).toBeVisible({ timeout: 15000 });

    // Reset button only appears when filters are non-default.
    await page.getByRole('button', { name: /^Reset$/ }).click();

    await page.waitForURL(/\/admin\/demandes(?!\?)/, { timeout: 10000 });
    expect(new URL(page.url()).search).toBe('');
  });
});
