import { test, expect, type Page } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const TEST_PASSWORD = 'TestPassw0rd!';
// A caster-role staff member doubles as a team captain on /admin/teams/my:
// isStaffAdmin === false, so the page auto-loads /api/admin/teams/my.
const CAPTAIN_EMAIL = 'hirtzvincent+e2e-teams-my@gmail.com';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_MEMBER_ID = '11111111-1111-1111-1111-111111111111';
const PLAYER_MEMBER_ID = '33333333-3333-3333-3333-333333333333';
const CAPTAIN_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAYER_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function teamPayload(
  over: { is_substitute?: boolean; battle_tag?: string } = {}
) {
  return {
    team: {
      id: TEAM_ID,
      slug: 'alpha',
      name: 'Alpha Team',
      short_name: 'ALP',
      logo_url: null,
      country: 'FR',
      description: null,
      is_joinable: false,
    },
    members: [
      {
        id: CAPTAIN_MEMBER_ID,
        user_id: CAPTAIN_USER_ID,
        display_name: 'Captain Joe',
        role: 'player',
        battle_tag: 'Captain#0001',
        is_substitute: false,
        captain: true,
        is_captain: true,
      },
      {
        id: PLAYER_MEMBER_ID,
        user_id: PLAYER_USER_ID,
        display_name: 'Player Pat',
        role: 'player',
        battle_tag: over.battle_tag ?? 'Player#0002',
        is_substitute: over.is_substitute ?? false,
        captain: false,
        is_captain: false,
      },
    ],
    isCaptain: true,
    isManager: false,
  };
}

/**
 * Dismiss the Next.js dev-mode error/issue overlay (<nextjs-portal>) if present.
 * In dev a pre-existing hydration warning can render a full-screen portal that
 * intercepts pointer events; it has no bearing on the page under test.
 */
async function dismissNextOverlay(page: Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal{display:none !important;pointer-events:none !important;}',
  });
}

async function loginAsCaptain(page: Page) {
  await page.goto('/login');
  await page.fill('input#email', CAPTAIN_EMAIL);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

// ─── Auth protection (no service role needed) ──────────────────────────────

test.describe('/admin/teams/my auth protection', () => {
  test('redirects unauthenticated user to login/403', async ({ page }) => {
    await page.goto('/admin/teams/my');
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(
      url.includes('/login') || url.includes('/403'),
      `expected redirect, got ${url}`
    ).toBeTruthy();
  });

  test('PATCH /api/teams/update-member without auth returns 401/403', async ({
    request,
  }) => {
    const res = await request.patch('/api/teams/update-member', {
      data: { memberId: PLAYER_MEMBER_ID, battle_tag: 'New#1234' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('PATCH /api/teams/update-member rejects GET method', async ({
    request,
  }) => {
    const res = await request.get('/api/teams/update-member');
    expect([401, 403, 405]).toContain(res.status());
  });
});

// ─── Authenticated UI flows (route-mocked endpoints) ───────────────────────

test.describe.serial('/admin/teams/my roster management', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(CAPTAIN_EMAIL);
    await createTestStaff(CAPTAIN_EMAIL, TEST_PASSWORD, 'caster');
  });

  test.afterAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(CAPTAIN_EMAIL);
  });

  test('renders roster, add-member and join-requests; supports BattleTag edit + substitute toggle', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // --- Route mocks --------------------------------------------------------
    let updateMemberCalls: any[] = [];
    let currentSub = false;
    let currentTag = 'Player#0002';

    await page.route('**/api/admin/teams/my**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          teamPayload({ is_substitute: currentSub, battle_tag: currentTag })
        ),
      });
    });

    await page.route('**/api/teams/join-requests**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          demandes: [
            {
              id: 'req-1',
              user_id: 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu',
              status: 'pending',
              comment: 'Je veux rejoindre',
              payload: { desired_role: 'player' },
              created_at: new Date().toISOString(),
              user: {
                id: 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu',
                email: 'wannabe@test.local',
                display_name: 'Wannabe',
                battle_tag: 'Wannabe#7777',
              },
            },
          ],
        }),
      });
    });

    await page.route('**/api/teams/update-member', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      updateMemberCalls.push(body);
      if (typeof body.battle_tag === 'string') currentTag = body.battle_tag;
      if (typeof body.is_substitute === 'boolean')
        currentSub = body.is_substitute;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          memberId: body.memberId,
          battle_tag: currentTag,
          is_substitute: currentSub,
          role: 'player',
        }),
      });
    });

    // --- Load page ----------------------------------------------------------
    await loginAsCaptain(page);
    await page.goto('/admin/teams/my');

    // Roster renders both members.
    await expect(page.getByText('Captain Joe')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Player Pat')).toBeVisible();

    // Hide the Next.js dev overlay so it doesn't intercept clicks.
    await dismissNextOverlay(page);

    // Add-member CTA + join-requests section render.
    await expect(
      page.getByRole('button', { name: /Ajouter/i }).first()
    ).toBeVisible();
    await expect(page.getByText(/Demandes de joueurs/i)).toBeVisible();
    await expect(page.getByText('Wannabe', { exact: true })).toBeVisible();

    // --- Inline BattleTag edit ---------------------------------------------
    await page.getByTestId(`edit-battletag-${PLAYER_MEMBER_ID}`).click();
    const input = page.getByTestId(`battletag-input-${PLAYER_MEMBER_ID}`);
    await expect(input).toBeVisible();
    await input.fill('NewTag#4242');
    await page.getByTestId(`save-battletag-${PLAYER_MEMBER_ID}`).click();

    await expect
      .poll(() =>
        updateMemberCalls.some(
          (c) =>
            c.memberId === PLAYER_MEMBER_ID && c.battle_tag === 'NewTag#4242'
        )
      )
      .toBeTruthy();

    // --- Substitute toggle --------------------------------------------------
    await page.getByTestId(`toggle-substitute-${PLAYER_MEMBER_ID}`).click();

    await expect
      .poll(() =>
        updateMemberCalls.some(
          (c) => c.memberId === PLAYER_MEMBER_ID && c.is_substitute === true
        )
      )
      .toBeTruthy();

    // The substitute badge appears after reload (mock returns currentSub=true).
    await expect(page.getByTestId('substitute-badge')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('substitute-count')).toBeVisible();
  });
});
