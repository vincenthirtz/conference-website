// E2E — pages/player/requests.tsx ("Demandes" : transfert / scrim)
//
// The player request console with two tabs (Transfert / Scrim). Covers:
//   - empty state when the user has no team (amber "Pas d'equipe" banner),
//   - switching between the Transfert and Scrim tabs,
//   - the captain-specific "blocked self-transfer" branch (a captain must hand
//     over the captaincy before requesting their own transfer).
//
// Auth = real player login (see _helpers/playerSession.ts). The page resolves
// the player context from /api/admin/teams/my (Bearer fetch) and the team list
// from /api/teams; both are route-mocked so the UI is deterministic.
import { test, expect, type Page } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+requests@gmail.com`;

// An always-empty team list keeps the lists deterministic (we never assert a
// row count, but a stable empty list avoids depending on the shared DB).
async function mockTeamsList(page: Page) {
  await mockApiJson(page, '/api/teams', { teams: [] });
}

async function mockNotifications(page: Page, hasTeam: boolean) {
  await mockApiJson(page, '/api/player/notifications', {
    hasTeam,
    isCaptain: false,
    isManager: false,
    captainTeamId: null,
    memberTeamId: null,
    unreadMessages: 0,
    pendingScrims: 0,
    pendingJoinRequests: 0,
    checkinPending: 0,
    total: 0,
  });
}

test.describe('Player requests inbox', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('no-team user sees the empty "Pas d\'equipe" state and can switch tabs', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    // User has no team → /api/admin/teams/my returns no team.
    await mockApiJson(page, '/api/admin/teams/my', {
      team: null,
      isCaptain: false,
      isManager: false,
      members: [],
    });
    await mockTeamsList(page);
    await mockNotifications(page, false);

    await loginPlayer(page, PLAYER_EMAIL, '/player/requests');

    await expect(
      page.getByRole('heading', { name: 'Demandes', level: 1 })
    ).toBeVisible({ timeout: 10000 });

    // Transfer tab (default): empty-state banner with the transfer copy.
    await expect(page.getByText("Pas d'equipe").first()).toBeVisible();
    await expect(
      page.getByText('pour demander un transfert.', { exact: false })
    ).toBeVisible();

    // Switch to the Scrim tab → its own (scrim-flavoured) empty-state banner.
    await page.getByRole('button', { name: 'Scrim' }).click();
    await expect(
      page.getByText('pour proposer un scrim.', { exact: false })
    ).toBeVisible();

    // Switch back to the Transfert tab.
    await page.getByRole('button', { name: 'Transfert' }).click();
    await expect(
      page.getByText('pour demander un transfert.', { exact: false })
    ).toBeVisible();
  });

  test('tab switch toggles the active styling between Transfert and Scrim', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockApiJson(page, '/api/admin/teams/my', {
      team: null,
      isCaptain: false,
      isManager: false,
      members: [],
    });
    await mockTeamsList(page);
    await mockNotifications(page, false);

    await loginPlayer(page, PLAYER_EMAIL, '/player/requests');

    const transferTab = page.getByRole('button', { name: 'Transfert' });
    const scrimTab = page.getByRole('button', { name: 'Scrim' });
    await expect(transferTab).toBeVisible({ timeout: 10000 });

    // Default tab is Transfert: its banner is the transfer one.
    await expect(
      page.getByText('pour demander un transfert.', { exact: false })
    ).toBeVisible();

    await scrimTab.click();
    // Scrim tab shows the scrim-flavoured empty-state copy.
    await expect(
      page.getByText('pour proposer un scrim.', { exact: false })
    ).toBeVisible();
  });

  test('captain on the self-transfer tab sees the "blocked" branch', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    // Captain of a team → mode toggle (Proposer / Mon transfert) is shown, and
    // the self ("Mon transfert") mode is blocked for captains.
    await mockApiJson(page, '/api/admin/teams/my', {
      team: { id: 'team-req-captain', name: 'Captain Squad' },
      isCaptain: true,
      isManager: false,
      members: [
        {
          user_id: 'other-player',
          role: 'player',
          battle_tag: 'Joueuse#1234',
          display_name: 'Joueuse',
        },
      ],
    });
    await mockTeamsList(page);
    await mockApiJson(page, '/api/player/notifications', {
      hasTeam: true,
      isCaptain: true,
      isManager: false,
      captainTeamId: 'team-req-captain',
      memberTeamId: 'team-req-captain',
      unreadMessages: 0,
      pendingScrims: 0,
      pendingJoinRequests: 0,
      checkinPending: 0,
      total: 0,
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/requests');

    await expect(
      page.getByRole('heading', { name: 'Demandes', level: 1 })
    ).toBeVisible({ timeout: 10000 });

    // Mode toggle is visible for captains; pick "Mon transfert".
    const selfModeButton = page.getByRole('button', { name: 'Mon transfert' });
    await expect(selfModeButton).toBeVisible();
    await selfModeButton.click();

    // The captain-blocked notice renders instead of a self-transfer form.
    await expect(
      page.getByText('tu dois d’abord transferer le role de capitaine', {
        exact: false,
      })
    ).toBeVisible();
  });
});
