// E2E — pages/admin/users/[userId]/player-view.tsx ("Vue player")
//
// READ-ONLY staff inspection of a target user's player area. We:
//   - log a REAL staff (manager) in through /login (genuine Supabase session,
//     identical harness to admin-users.spec.ts);
//   - route-mock GET /api/admin/users/[userId]/player-view with a representative
//     payload (team + 1 upcoming + 1 past match + non-zero notifications +
//     a demande);
//   - assert the read-only banner renders, the 5 tabs switch content, the match
//     score/badges show, and there are NO action controls.
//
// The data endpoint is mocked so the UI is deterministic and independent of DB
// state — the page itself is the system under test.

import { test, expect } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const STAFF_PASSWORD = 'TestPassw0rd!';
const STAFF_EMAIL = 'hirtzvincent+playerviewmgr@gmail.com';

const TARGET_USER_ID = '11111111-1111-4111-8111-111111111111';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

function buildPayload() {
  return {
    user: {
      id: TARGET_USER_ID,
      email: 'joueuse@example.com',
      displayName: 'Joueuse Test',
      battleTag: 'Joueuse#1234',
      avatarUrl: null,
      role: 'player',
      createdAt: '2025-01-15T10:00:00.000Z',
    },
    team: {
      id: 'team-1',
      name: 'Les Phénix',
      slug: 'les-phenix',
      logoUrl: null,
      role: 'captain' as const,
      isSubstitute: false,
      members: [
        {
          id: 'tm-1',
          displayName: 'Joueuse Test',
          battleTag: 'Joueuse#1234',
          role: 'captain',
          isSubstitute: false,
        },
        {
          id: 'tm-2',
          displayName: 'Coéquipière',
          battleTag: 'Mate#5678',
          role: 'member',
          isSubstitute: false,
        },
      ],
    },
    matches: [
      {
        id: 'm-upcoming',
        scheduledAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
        status: 'pending',
        roundName: 'Quart de finale',
        format: 'bo3',
        bestOf: 3,
        streamUrl: null,
        slot: 1 as const,
        opponent: { id: 'opp-1', name: 'Team Adverse' },
        score: null,
        result: null,
        tournament: { id: 't-1', name: 'Conference Cup', slug: 'conf-cup' },
        checkin: {
          token: null,
          alreadyCheckedIn: true,
          opensAt: null,
          closesAt: null,
          isOpen: false,
          isPassed: false,
        },
      },
      {
        id: 'm-past',
        scheduledAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        status: 'completed',
        roundName: 'Phase de groupes',
        format: 'bo3',
        bestOf: 3,
        streamUrl: null,
        slot: 1 as const,
        opponent: { id: 'opp-2', name: 'Old Rivals' },
        score: { mine: 2, opponent: 1 },
        result: 'win' as const,
        tournament: { id: 't-1', name: 'Conference Cup', slug: 'conf-cup' },
        checkin: null,
      },
    ],
    notifications: {
      hasTeam: true,
      isCaptain: true,
      isManager: false,
      unreadMessages: 2,
      pendingScrims: 1,
      pendingJoinRequests: 0,
      checkinPending: 0 as const,
      total: 3,
    },
    demandes: [
      {
        id: 'd-1',
        type: 'join',
        status: 'approved',
        created_at: '2025-02-01T12:00:00.000Z',
        comment: 'Je souhaite rejoindre cette équipe.',
        team: { id: 'team-1', name: 'Les Phénix' },
      },
    ],
  };
}

/**
 * Next.js dev mode renders a `<nextjs-portal>` overlay for hydration warnings
 * (the shared Navbar has a known dev-only scroll-position hydration mismatch)
 * that intercepts pointer events. Dismiss it so it doesn't block tab clicks.
 * No-op in prod / when not present.
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

async function gotoPlayerView(page: import('@playwright/test').Page) {
  // Real staff login through /login → routed to /admin.
  await page.goto('/login');
  await page.fill('input#email', STAFF_EMAIL);
  await page.fill('input#password', STAFF_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });

  await page.goto(`/admin/users/${TARGET_USER_ID}/player-view`);
}

test.describe('Admin "Vue player" (read-only)', () => {
  test.beforeAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'manager');
    }
  });

  test.afterAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('renders banner, switches all 5 tabs, shows score/badges, no actions', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.route(
      (url) =>
        url.pathname ===
        `/api/admin/users/${TARGET_USER_ID}/player-view`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildPayload()),
        });
      }
    );

    await gotoPlayerView(page);

    // Read-only banner.
    await expect(
      page.getByRole('heading', {
        name: /Vue lecture seule — espace joueur de Joueuse Test/,
      })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Aucune action n'est effectuée/)).toBeVisible();

    await dismissNextDevOverlay(page);

    // Back link to the management screen.
    await expect(
      page.getByRole('link', { name: /Retour à la gestion des inscrits/ })
    ).toHaveAttribute('href', '/admin/users/manage');

    // Default tab = Profil → email + battletag visible.
    await expect(page.getByText('joueuse@example.com')).toBeVisible();
    await expect(
      page.getByText('Joueuse#1234', { exact: false }).first()
    ).toBeVisible();

    // Équipe tab.
    await page.getByRole('tab', { name: 'Équipe' }).click();
    await expect(page.getByText('Les Phénix')).toBeVisible();
    await expect(page.getByText('Coéquipière')).toBeVisible();
    await expect(page.getByText('Mate#5678')).toBeVisible();

    // Mes matchs tab → upcoming check-in text + past score + Victoire badge.
    await page.getByRole('tab', { name: 'Mes matchs' }).click();
    await expect(page.getByText('Team Adverse')).toBeVisible();
    await expect(page.getByText('Check-in validé')).toBeVisible();
    await expect(page.getByText('Old Rivals')).toBeVisible();
    // Score "2 – 1" renders in a single tabular element next to the badge.
    await expect(page.getByText(/2\s*–\s*1/)).toBeVisible();
    await expect(page.getByText('Victoire')).toBeVisible();

    // Notifications tab → counters as stat tiles.
    await page.getByRole('tab', { name: 'Notifications' }).click();
    await expect(page.getByText('Messages non lus')).toBeVisible();
    await expect(page.getByText('Scrims en attente')).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();

    // Demandes tab → list with status badge + comment.
    await page.getByRole('tab', { name: 'Demandes' }).click();
    await expect(page.getByText('Rejoindre une équipe')).toBeVisible();
    await expect(page.getByText('Approuvée')).toBeVisible();
    await expect(
      page.getByText(/Je souhaite rejoindre cette équipe/)
    ).toBeVisible();

    // NO action controls anywhere on the page.
    await expect(
      page.getByRole('button', { name: /Enregistrer|Sauvegarder/ })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Check-in/ })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /Check-in/ })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Quitter/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Annuler/ })).toHaveCount(0);
  });

  test('404 → "Utilisateur introuvable"', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.route(
      (url) =>
        url.pathname ===
        `/api/admin/users/${TARGET_USER_ID}/player-view`,
      async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Utilisateur introuvable' }),
        });
      }
    );

    await gotoPlayerView(page);

    await expect(
      page.getByText('Utilisateur introuvable', { exact: false })
    ).toBeVisible({ timeout: 15000 });
  });
});
