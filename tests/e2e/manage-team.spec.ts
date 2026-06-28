// E2E — pages/player/manage-team.tsx ("Gerer mon equipe", roster console)
//
// Captain-only roster console: recruiting toggle, per-member specialty + role
// selects, two-step "promote captain" confirm, two-step "remove member"
// confirm, and pending join-requests. A non-captain / no-team user gets the
// access-denied state.
//
// Auth = real player login (see _helpers/playerSession.ts). The page reads its
// data from /api/admin/teams/my and /api/teams/join-requests via adminFetchJson;
// we route-mock those so the roster is deterministic and independent of DB
// state. We deliberately stop the destructive flows (promote / remove) AT the
// confirm affordance — we assert the two-step confirm renders without
// committing, so no real mutation is needed.
import { test, expect, type Page } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+manageteam@gmail.com`;

// Deterministic roster: the captain (cannot be removed/promoted) + one
// regular player + one substitute (both actionable).
const CAPTAIN_MEMBER = {
  id: 'mem-captain',
  user_id: 'user-captain',
  role: 'player',
  battle_tag: 'Capitaine#0001',
  is_substitute: false,
  is_captain: true,
  specialty: 'tank',
};
const PLAYER_MEMBER = {
  id: 'mem-player',
  user_id: 'user-player',
  role: 'player',
  battle_tag: 'Coequipiere#0002',
  is_substitute: false,
  is_captain: false,
  specialty: null,
};
const SUB_MEMBER = {
  id: 'mem-sub',
  user_id: 'user-sub',
  role: 'substitute',
  battle_tag: 'Remplacante#0003',
  is_substitute: true,
  is_captain: false,
  specialty: 'support',
};

const TEAM = {
  id: 'team-e2e-manage',
  slug: 'team-e2e-manage',
  name: 'Roster Console Squad',
  short_name: 'RCS',
  logo_url: null,
  country: 'FR',
  description: null,
  is_joinable: false,
};

/** Mock the page data as a captain owning a 3-member team. */
async function mockAsCaptain(page: Page) {
  await mockApiJson(page, '/api/admin/teams/my', {
    team: TEAM,
    members: [CAPTAIN_MEMBER, PLAYER_MEMBER, SUB_MEMBER],
    isCaptain: true,
    isManager: false,
  });
  await mockApiJson(page, '/api/teams/join-requests', { demandes: [] });
  // PlayerTopBar reads this; keep it quiet.
  await mockApiJson(page, '/api/player/notifications', {
    hasTeam: true,
    isCaptain: true,
    isManager: false,
    captainTeamId: TEAM.id,
    memberTeamId: TEAM.id,
    unreadMessages: 0,
    pendingScrims: 0,
    pendingJoinRequests: 0,
    checkinPending: 0,
    total: 0,
  });
}

test.describe('Manage-team roster console', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('captain sees the roster, recruiting toggle and per-member controls', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockAsCaptain(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player/manage-team');

    // Team header.
    await expect(
      page.getByRole('heading', { name: TEAM.name, level: 1 })
    ).toBeVisible({ timeout: 10000 });

    // All three members are listed (stable battle-tag content, no count assert).
    await expect(page.getByText(CAPTAIN_MEMBER.battle_tag)).toBeVisible();
    await expect(page.getByText(PLAYER_MEMBER.battle_tag)).toBeVisible();
    await expect(page.getByText(SUB_MEMBER.battle_tag)).toBeVisible();

    // Captain row is read-only: no remove / promote affordances for it.
    const captainRow = page
      .locator('div')
      .filter({ hasText: CAPTAIN_MEMBER.battle_tag })
      .last();
    await expect(
      captainRow.getByRole('button', { name: 'Nommer capitaine' })
    ).toHaveCount(0);

    // Recruiting toggle + specialty select render.
    await expect(
      page.getByRole('heading', { name: 'Recrutement' })
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Rôle en jeu' })
    ).toHaveCount(
      2 // one per actionable (non-captain) member
    );
  });

  test('recruiting toggle issues a POST and reflects the new state', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockAsCaptain(page);

    let toggleBody: unknown = null;
    await page.route('**/api/teams/toggle-joinable', async (route) => {
      toggleBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ is_joinable: true }),
      });
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/manage-team');

    // Initially closed (TEAM.is_joinable === false).
    await expect(
      page.getByText('Ton equipe est fermee au recrutement.')
    ).toBeVisible({ timeout: 10000 });

    // The recruitment card carries the closed-state description and a single
    // toggle button; scope to the innermost div holding both.
    const recruitmentSection = page
      .locator('div')
      .filter({ hasText: 'Ton equipe est fermee au recrutement.' })
      .filter({ has: page.getByRole('button') })
      .last();
    await recruitmentSection.getByRole('button').last().click();

    // Success banner confirms the new state and the request body carried it.
    await expect(page.getByText('Recrutement ouvert')).toBeVisible();
    expect(toggleBody).toEqual({ joinable: true });
  });

  test('remove-member shows a two-step confirm affordance', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockAsCaptain(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player/manage-team');

    await expect(page.getByText(PLAYER_MEMBER.battle_tag)).toBeVisible({
      timeout: 10000,
    });

    // The member row is the innermost div carrying both the battle-tag and the
    // action button (battle-tag and the buttons are siblings, so we scope to
    // their common row via has:).
    const playerRow = page
      .locator('div')
      .filter({ hasText: PLAYER_MEMBER.battle_tag })
      .filter({ has: page.getByRole('button', { name: 'Retirer' }) })
      .last();

    // Click the "Retirer" icon button → reveals the confirm/cancel pair.
    await playerRow.getByRole('button', { name: 'Retirer' }).click();

    // The two-step confirm prompt + Confirmer/Annuler pair appears.
    await expect(
      page.getByText(`Retirer ${PLAYER_MEMBER.battle_tag} de l'équipe ?`)
    ).toBeVisible();
    const confirmRow = page
      .locator('div')
      .filter({ hasText: PLAYER_MEMBER.battle_tag })
      .filter({ has: page.getByRole('button', { name: 'Confirmer' }) })
      .last();
    await expect(
      confirmRow.getByRole('button', { name: 'Confirmer' })
    ).toBeVisible();
    await expect(
      confirmRow.getByRole('button', { name: 'Annuler' })
    ).toBeVisible();

    // Cancel — we do not commit the destructive action.
    await confirmRow.getByRole('button', { name: 'Annuler' }).click();
    await expect(
      page
        .locator('div')
        .filter({ hasText: PLAYER_MEMBER.battle_tag })
        .filter({ has: page.getByRole('button', { name: 'Retirer' }) })
        .last()
        .getByRole('button', { name: 'Retirer' })
    ).toBeVisible();
  });

  test('promote-captain shows a two-step confirm affordance', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockAsCaptain(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player/manage-team');

    await expect(page.getByText(SUB_MEMBER.battle_tag)).toBeVisible({
      timeout: 10000,
    });

    const subRow = page
      .locator('div')
      .filter({ hasText: SUB_MEMBER.battle_tag })
      .filter({ has: page.getByRole('button', { name: 'Nommer capitaine' }) })
      .last();

    await subRow.getByRole('button', { name: 'Nommer capitaine' }).click();

    await expect(
      page.getByText(`Nommer ${SUB_MEMBER.battle_tag} capitaine ?`)
    ).toBeVisible();
    // Confirm + Cancel both present; we stop here without committing.
    const confirmRow = page
      .locator('div')
      .filter({ hasText: SUB_MEMBER.battle_tag })
      .filter({ has: page.getByRole('button', { name: 'Confirmer' }) })
      .last();
    await expect(
      confirmRow.getByRole('button', { name: 'Confirmer' })
    ).toBeVisible();
    await confirmRow.getByRole('button', { name: 'Annuler' }).click();
    await expect(
      page
        .locator('div')
        .filter({ hasText: SUB_MEMBER.battle_tag })
        .filter({ has: page.getByRole('button', { name: 'Nommer capitaine' }) })
        .last()
        .getByRole('button', { name: 'Nommer capitaine' })
    ).toBeVisible();
  });

  test('degraded: non-captain / no-team user gets the access-denied state', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    // No team at all → access denied branch.
    await mockApiJson(page, '/api/admin/teams/my', {
      team: null,
      members: [],
      isCaptain: false,
      isManager: false,
    });
    await mockApiJson(page, '/api/teams/join-requests', { demandes: [] });
    await mockApiJson(page, '/api/player/notifications', {
      hasTeam: false,
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

    await loginPlayer(page, PLAYER_EMAIL, '/player/manage-team');

    await expect(
      page.getByRole('heading', { name: 'Acces refuse' })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('link', { name: 'Retour a mon espace' })
    ).toBeVisible();
  });
});
