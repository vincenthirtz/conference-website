import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const RUN_ID = `${Date.now()}`;
const TOURNAMENT_NAME = `E2E Tournament TeamLink ${RUN_ID}`;
const TOURNAMENT_SLUG = `e2e-tournament-teamlink-${RUN_ID}`;
const TEAM_NAME = `E2E TeamLink ${RUN_ID}`;

test.describe('Public tournament page → team link', () => {
  let tournamentId: string;
  let teamId: string;
  let teamSlug: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    const { data: t, error: tErr } = await supabaseTestClient!
      .from('tournaments')
      .insert({
        name: TOURNAMENT_NAME,
        slug: TOURNAMENT_SLUG,
        status: 'running',
        game: 'Overwatch',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (tErr) throw tErr;
    tournamentId = t!.id;

    const { data: team, error: teamErr } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: TEAM_NAME,
        is_active: true,
      })
      .select('id, slug')
      .single();
    if (teamErr) throw teamErr;
    teamId = team!.id;
    teamSlug = (team as any)!.slug as string;

    const { error: ttErr } = await supabaseTestClient!
      .from('tournament_teams')
      .insert({
        tournament_id: tournamentId,
        team_id: teamId,
        status: 'registered',
      });
    if (ttErr) throw ttErr;
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    if (tournamentId) {
      await supabaseTestClient!
        .from('tournament_teams')
        .delete()
        .eq('tournament_id', tournamentId);
      await supabaseTestClient!
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    }
    if (teamId) {
      await supabaseTestClient!.from('teams').delete().eq('id', teamId);
    }
  });

  test('clicking a team on the tournament page lands on its public page', async ({
    page,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await page.goto(`/tournament/${tournamentId}`);

    // Verify the page loaded the tournament we expect.
    await expect(
      page.getByRole('heading', { name: TOURNAMENT_NAME })
    ).toBeVisible({ timeout: 15000 });

    // The team grid renders the team name as inner text on a Link wrapper.
    // After the slug migration the link uses the slug, not the UUID.
    const expectedHref = `/team/${teamSlug || teamId}`;
    const teamLink = page
      .locator(`a[href="${expectedHref}"]`)
      .filter({ hasText: TEAM_NAME })
      .first();
    await expect(teamLink).toBeVisible({ timeout: 15000 });

    await teamLink.click();

    await page.waitForURL(`**${expectedHref}`, { timeout: 10000 });

    // The public team page renders the team name as its main heading.
    await expect(
      page.getByRole('heading', { name: TEAM_NAME })
    ).toBeVisible({ timeout: 15000 });
  });
});
