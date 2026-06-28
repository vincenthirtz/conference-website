// E2E — i18n FR/EN toggle (components/Navbar/LanguageToggle.tsx +
// lib/i18n/LanguageProvider.tsx)
//
// The player-area language switch (FR default). Covers:
//   - toggling FR -> EN swaps known on-page copy (a real, namespaced string),
//   - the choice persists in localStorage under `cw_player_lang`,
//   - a full page reload keeps the EN choice.
//
// We exercise the toggle on /player/manage-team because it renders both the
// PlayerTopBar (which hosts the FR/EN switch) and a deterministic, translated
// heading ("Recrutement" / "Recruitment"). Auth = real player login; the page
// data endpoints are route-mocked so the heading is always present.
import { test, expect, type Page } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+langtoggle@gmail.com`;
const STORAGE_KEY = 'cw_player_lang';

const TEAM = {
  id: 'team-e2e-lang',
  slug: 'team-e2e-lang',
  name: 'Langue Test Squad',
  short_name: 'LTS',
  logo_url: null,
  country: 'FR',
  description: null,
  is_joinable: true,
};

async function mockManageTeam(page: Page) {
  await mockApiJson(page, '/api/admin/teams/my', {
    team: TEAM,
    members: [
      {
        id: 'mem-cap',
        user_id: 'user-cap',
        role: 'player',
        battle_tag: 'Capitaine#0001',
        is_substitute: false,
        is_captain: true,
        specialty: null,
      },
    ],
    isCaptain: true,
    isManager: false,
  });
  await mockApiJson(page, '/api/teams/join-requests', { demandes: [] });
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

test.describe('Player-area language toggle (FR/EN)', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('toggling FR -> EN switches copy and persists across reload', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockManageTeam(page);
    await loginPlayer(page, PLAYER_EMAIL, '/player/manage-team');

    // FR default: the recruitment section heading is French.
    await expect(
      page.getByRole('heading', { name: 'Recrutement' })
    ).toBeVisible({ timeout: 10000 });

    // The FR/EN switch lives in the PlayerTopBar language group.
    const langGroup = page.getByRole('group', { name: 'Choix de la langue' });
    await expect(langGroup).toBeVisible();
    await langGroup.getByRole('button', { name: 'EN' }).click();

    // Known piece of copy switches to English (manageTeam.recruitment).
    await expect(
      page.getByRole('heading', { name: 'Recruitment' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recrutement' })
    ).toHaveCount(0);

    // The EN button is now the active one.
    await expect(
      page.getByRole('group').getByRole('button', { name: 'EN' })
    ).toHaveAttribute('aria-pressed', 'true');

    // Persisted to localStorage.
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      STORAGE_KEY
    );
    expect(stored).toBe('en');

    // Reload keeps EN (provider rehydrates from localStorage).
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Recruitment' })
    ).toBeVisible({ timeout: 10000 });
    const afterReload = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      STORAGE_KEY
    );
    expect(afterReload).toBe('en');
  });
});
