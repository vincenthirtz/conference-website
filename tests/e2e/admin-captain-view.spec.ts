// E2E — pages/admin/users/[userId]/captain-view.tsx ("Vue capitaine")
//
// The "Vue capitaine" is a per-captain command center calqued on the "Vue
// player". It is READ-ONLY except for two wired actions:
//   - approve / reject a pending JOIN demande  → POST /api/admin/demandes
//   - promote a roster member to captain       → POST /api/admin/users/[id]/actions
// We:
//   - log a REAL staff (manager) in through /login (genuine Supabase session);
//   - route-mock GET /api/admin/users/[userId]/captain-view with a
//     representative payload (team + roster + 1 pending join request +
//     1 pending scrim + demande history);
//   - assert the banner renders, the 4 tabs switch content, and the staff CAN
//     act (promote member → POST actions ; approve join → POST demandes).
//
// NB: like admin-player-view.spec.ts, these tests SKIP without a Supabase
// service-role key (no isolated test DB locally). tsc + i18n parity are the
// primary safety net; this spec is the deterministic UI filet.

import { test, expect } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const STAFF_PASSWORD = 'TestPassw0rd!';
const STAFF_EMAIL = 'hirtzvincent+captainviewmgr@gmail.com';

const TARGET_USER_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_USER_ID = '44444444-4444-4444-8444-444444444444';
const JOIN_DEMANDE_ID = '55555555-5555-4555-8555-555555555555';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

function buildPayload() {
  return {
    user: {
      id: TARGET_USER_ID,
      email: 'capitaine@example.com',
      displayName: 'Capitaine Test',
      avatarUrl: null,
      role: 'player',
      battleTag: 'Cap#1234',
      createdAt: '2025-01-15T10:00:00.000Z',
    },
    team: {
      id: 'team-9',
      name: 'Les Corbeaux',
      slug: 'les-corbeaux',
      logoUrl: null,
      isJoinable: true,
      openForScrim: false,
      captainId: TARGET_USER_ID,
      members: [
        {
          id: 'tm-1',
          userId: TARGET_USER_ID,
          displayName: 'Capitaine Test',
          battleTag: 'Cap#1234',
          role: 'captain',
          isSubstitute: false,
          isCaptain: true,
        },
        {
          id: 'tm-2',
          userId: MEMBER_USER_ID,
          displayName: 'Coéquipière',
          battleTag: 'Mate#5678',
          role: 'member',
          isSubstitute: false,
          isCaptain: false,
        },
      ],
    },
    isCaptain: true,
    isManager: false,
    joinRequests: [
      {
        id: JOIN_DEMANDE_ID,
        user: { displayName: 'Recrue', battleTag: 'New#0001' },
        desiredRole: 'dps',
        comment: 'Je veux rejoindre votre équipe.',
        createdAt: '2025-02-01T12:00:00.000Z',
      },
    ],
    pendingScrims: [
      {
        id: 'scrim-1',
        opponent: 'Team Adverse',
        status: 'pending',
        slots: ['Lundi 20h', 'Mardi 21h'],
        createdAt: '2025-02-02T12:00:00.000Z',
      },
    ],
    nextMatch: {
      match: null,
      team: null,
      opponent: null,
      tournament: null,
      checkin: null,
      readiness: null,
    },
    demandes: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        type: 'scrim',
        status: 'approved',
        created_at: '2025-01-20T12:00:00.000Z',
        comment: null,
        team: { id: 'team-9', name: 'Les Corbeaux' },
      },
    ],
  };
}

/**
 * Next.js dev overlay intercepts pointer events; remove it so tab clicks land.
 */
async function dismissNextDevOverlay(page: import('@playwright/test').Page) {
  await page
    .addStyleTag({
      content:
        'nextjs-portal, nextjs-portal * { display: none !important; pointer-events: none !important; }',
    })
    .catch(() => undefined);
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal').forEach((el) => el.remove());
  });
}

async function gotoCaptainView(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input#email', STAFF_EMAIL);
  await page.fill('input#password', STAFF_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });

  await page.goto(`/admin/users/${TARGET_USER_ID}/captain-view`);
}

test.describe('Admin "Vue capitaine" (command center)', () => {
  test.beforeAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'manager');
    }
  });

  test.afterAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('renders banner, switches all 4 tabs, shows roster + scrims + history', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.route(
      (url) =>
        url.pathname === `/api/admin/users/${TARGET_USER_ID}/captain-view`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildPayload()),
        });
      }
    );

    await gotoCaptainView(page);

    await expect(
      page.getByRole('heading', { name: /Espace capitaine de Capitaine Test/ })
    ).toBeVisible({ timeout: 15000 });

    await dismissNextDevOverlay(page);

    // Cross-link to the player view.
    await expect(
      page.getByRole('link', { name: /Voir la vue player/ })
    ).toHaveAttribute('href', `/admin/users/${TARGET_USER_ID}/player-view`);

    // Default tab = Équipe → team name + roster + read-only recruiting badge.
    await expect(page.getByText('Les Corbeaux')).toBeVisible();
    await expect(page.getByText('Coéquipière')).toBeVisible();
    await expect(page.getByText('Mate#5678')).toBeVisible();

    // Demandes de join tab.
    await page.getByRole('tab', { name: 'Demandes de join' }).click();
    await expect(page.getByText('Recrue')).toBeVisible();
    await expect(
      page.getByText(/Je veux rejoindre votre équipe/)
    ).toBeVisible();

    // Scrims tab (read-only).
    await page.getByRole('tab', { name: 'Scrims' }).click();
    await expect(page.getByText('Team Adverse')).toBeVisible();
    await expect(page.getByText('Lundi 20h')).toBeVisible();

    // Historique tab.
    await page.getByRole('tab', { name: 'Historique' }).click();
    await expect(page.getByText('Scrim', { exact: true })).toBeVisible();
    await expect(page.getByText('Approuvée', { exact: true })).toBeVisible();
  });

  test('promoting a member triggers POST /api/admin/users/[id]/actions', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.route(
      (url) =>
        url.pathname === `/api/admin/users/${TARGET_USER_ID}/captain-view`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildPayload()),
        });
      }
    );

    let actionBody: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === `/api/admin/users/${MEMBER_USER_ID}/actions`,
      async (route) => {
        if (route.request().method() === 'POST') {
          actionBody = route.request().postDataJSON() as Record<
            string,
            unknown
          >;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, teamId: 'team-9' }),
          });
          return;
        }
        await route.continue();
      }
    );

    await gotoCaptainView(page);
    await expect(
      page.getByRole('heading', { name: /Espace capitaine de Capitaine Test/ })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);

    // Équipe tab is default → promote the non-captain member.
    await page.getByRole('button', { name: 'Promouvoir capitaine' }).click();

    const dialog = page.getByRole('dialog', {
      name: /Promouvoir ce membre capitaine/,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Promouvoir capitaine' }).click();

    await expect.poll(() => actionBody).not.toBeNull();
    expect(actionBody).toMatchObject({ action: 'assign_captain' });
  });

  test('approving a join request triggers POST /api/admin/demandes', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.route(
      (url) =>
        url.pathname === `/api/admin/users/${TARGET_USER_ID}/captain-view`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildPayload()),
        });
      }
    );

    let demandeBody: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === '/api/admin/demandes',
      async (route) => {
        if (route.request().method() === 'POST') {
          demandeBody = route.request().postDataJSON() as Record<
            string,
            unknown
          >;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, updatedCount: 1 }),
          });
          return;
        }
        await route.continue();
      }
    );

    await gotoCaptainView(page);
    await expect(
      page.getByRole('heading', { name: /Espace capitaine de Capitaine Test/ })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);

    await page.getByRole('tab', { name: 'Demandes de join' }).click();
    const main = page.locator('#main-content');
    await main.getByRole('button', { name: 'Approuver' }).click();

    const dialog = page.getByRole('dialog', {
      name: /Approuver cette demande/,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Approuver' }).click();

    await expect.poll(() => demandeBody).not.toBeNull();
    expect(demandeBody).toMatchObject({
      action: 'updateStatus',
      demandeIds: [JOIN_DEMANDE_ID],
      newStatus: 'approved',
    });
  });

  test('not-a-captain → "Pas de capitanat" empty state', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.route(
      (url) =>
        url.pathname === `/api/admin/users/${TARGET_USER_ID}/captain-view`,
      async (route) => {
        const payload = buildPayload();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...payload,
            team: null,
            isCaptain: false,
            joinRequests: [],
            pendingScrims: [],
            demandes: [],
          }),
        });
      }
    );

    await gotoCaptainView(page);

    await expect(
      page.getByText('Pas de capitanat', { exact: false })
    ).toBeVisible({ timeout: 15000 });
  });

  test('404 → "Utilisateur introuvable"', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.route(
      (url) =>
        url.pathname === `/api/admin/users/${TARGET_USER_ID}/captain-view`,
      async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'User not found' }),
        });
      }
    );

    await gotoCaptainView(page);

    await expect(
      page.getByText('Utilisateur introuvable', { exact: false })
    ).toBeVisible({ timeout: 15000 });
  });
});
