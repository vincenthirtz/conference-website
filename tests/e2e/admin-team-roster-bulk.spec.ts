import { test, expect, type Page } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const TEST_PASSWORD = 'TestPassw0rd!';
const STAFF_EMAIL = 'hirtzvincent+e2e-roster-bulk@gmail.com';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_MEMBER_ID = '11111111-1111-1111-1111-111111111111';
const PLAYER_A_MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_B_MEMBER_ID = '33333333-3333-3333-3333-333333333333';
const CAPTAIN_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function teamPayload() {
  return {
    team: {
      id: TEAM_ID,
      slug: 'alpha',
      name: 'Alpha Team',
      short_name: 'ALP',
      logo_url: null,
      banner_url: null,
      country: 'FR',
      description: null,
      captain_id: CAPTAIN_USER_ID,
      is_active: true,
    },
  };
}

function membersPayload() {
  return {
    members: [
      {
        id: CAPTAIN_MEMBER_ID,
        team_id: TEAM_ID,
        user_id: CAPTAIN_USER_ID,
        role: 'player',
        battle_tag: 'Captain#0001',
        is_substitute: false,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: PLAYER_A_MEMBER_ID,
        team_id: TEAM_ID,
        user_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        role: 'player',
        battle_tag: 'Aaa#1234',
        is_substitute: false,
        created_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: PLAYER_B_MEMBER_ID,
        team_id: TEAM_ID,
        user_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        role: 'player',
        battle_tag: 'Bbb#5678',
        is_substitute: false,
        created_at: '2026-01-03T00:00:00.000Z',
      },
    ],
    total: 3,
  };
}

async function dismissNextOverlay(page: Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal{display:none !important;pointer-events:none !important;}',
  });
}

async function loginAsStaff(page: Page) {
  await page.goto('/login');
  await page.fill('input#email', STAFF_EMAIL);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

async function mockReads(page: Page) {
  await page.route(`**/api/admin/teams/${TEAM_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(teamPayload()),
    });
  });
  await page.route(`**/api/admin/teams/${TEAM_ID}/members`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(membersPayload()),
    });
  });
  await page.route(
    `**/api/admin/teams/${TEAM_ID}/tournaments`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ registered: [], available: [] }),
      });
    }
  );
}

// ─── Auth protection ───────────────────────────────────────────────────────

test.describe('/admin/teams/[teamId]/edit bulk auth', () => {
  test('POST /api/admin/teams/.../roster-bulk without auth returns 401/403', async ({
    request,
  }) => {
    const res = await request.post(`/api/admin/teams/${TEAM_ID}/roster-bulk`, {
      data: { operation: 'remove', memberIds: [PLAYER_A_MEMBER_ID] },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ─── Authenticated UI flows (route-mocked) ─────────────────────────────────

test.describe.serial('/admin/teams/[teamId]/edit bulk roster UI', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(STAFF_EMAIL);
    await createTestStaff(STAFF_EMAIL, TEST_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('select-all + bulk role apply posts the expected payload', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    const bulkCalls: any[] = [];
    await mockReads(page);
    await page.route(
      `**/api/admin/teams/${TEAM_ID}/roster-bulk`,
      async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        bulkCalls.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            operation: body.operation,
            results: (body.memberIds || []).map((id: string) => ({
              memberId: id,
              ok: true,
            })),
            successCount: (body.memberIds || []).length,
            failureCount: 0,
          }),
        });
      }
    );

    await loginAsStaff(page);
    await page.goto(`/admin/teams/${TEAM_ID}/edit`);
    await dismissNextOverlay(page);

    // Roster renders.
    await expect(page.getByText('Aaa#1234')).toBeVisible({ timeout: 15000 });

    // Select all members.
    await page.getByTestId('select-all-members').check();
    await expect(page.getByTestId('selection-count')).toContainText(
      '3 sélectionné'
    );

    // Pick a bulk role and apply.
    await page.getByTestId('bulk-role-select').selectOption('coach');
    await page.getByTestId('bulk-role-apply').click();

    await expect
      .poll(() =>
        bulkCalls.some(
          (c) =>
            c.operation === 'set_role' &&
            c.role === 'coach' &&
            Array.isArray(c.memberIds) &&
            c.memberIds.length === 3
        )
      )
      .toBeTruthy();
  });

  test('CSV import preview shows matched / invalid / not-found', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockReads(page);
    await loginAsStaff(page);
    await page.goto(`/admin/teams/${TEAM_ID}/edit`);
    await dismissNextOverlay(page);

    await expect(page.getByText('Aaa#1234')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('open-import-modal').click();
    await expect(page.getByTestId('import-modal')).toBeVisible();

    // One matched (by current battle tag), one invalid format, one not-found.
    await page
      .getByTestId('import-textarea')
      .fill('Aaa#1234,New#4242\nBbb#5678,not-a-tag\nGhost#0000,Other#9999');
    await page.getByTestId('import-preview-btn').click();

    await expect(page.getByTestId('import-preview')).toBeVisible();
    await expect(page.getByTestId('import-row-matched')).toHaveCount(1);
    await expect(page.getByTestId('import-row-invalid')).toHaveCount(1);
    await expect(page.getByTestId('import-row-not-found')).toHaveCount(1);
  });
});
