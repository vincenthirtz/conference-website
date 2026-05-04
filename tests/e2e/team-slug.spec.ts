import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const RUN_ID = `${Date.now()}`;
const TEAM_NAME = `E2E Slug Team ${RUN_ID}`;
const EXPECTED_SLUG = `e2e-slug-team-${RUN_ID}`;

test.describe('teams.slug column + auto-generation', () => {
  let teamId: string;
  let migrationApplied = false;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    // Probe whether the slug column / trigger have been applied. If not,
    // skip the suite gracefully so it doesn't fail on environments that
    // haven't run database/migrations/add_team_slug.sql yet.
    const probe = await supabaseTestClient!
      .from('teams')
      .select('slug')
      .limit(1);
    if (probe.error) {
      migrationApplied = false;
      return;
    }
    migrationApplied = true;

    const { data: team, error } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: TEAM_NAME,
        is_active: true,
      })
      .select('id, slug')
      .single();
    if (error) throw error;
    teamId = team!.id;

    // Trigger should have populated slug from name
    expect(team!.slug).toBe(EXPECTED_SLUG);
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE || !teamId) return;
    await supabaseTestClient!.from('teams').delete().eq('id', teamId);
  });

  test('public team page resolves by slug', async ({ page }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');
    test.skip(
      !migrationApplied,
      'Migration add_team_slug.sql not applied on this environment'
    );

    await page.goto(`/team/${EXPECTED_SLUG}`);

    await expect(
      page.getByRole('heading', { name: TEAM_NAME })
    ).toBeVisible({ timeout: 15000 });
  });

  test('public team page still resolves by UUID (back-compat)', async ({
    page,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');
    test.skip(
      !migrationApplied,
      'Migration add_team_slug.sql not applied on this environment'
    );

    await page.goto(`/team/${teamId}`);

    await expect(
      page.getByRole('heading', { name: TEAM_NAME })
    ).toBeVisible({ timeout: 15000 });
  });

  test('/scrim page links to /team/<slug>', async ({ page }) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');
    test.skip(
      !migrationApplied,
      'Migration add_team_slug.sql not applied on this environment'
    );

    // The scrim page is generated via getStaticProps with revalidate. Hitting
    // a fresh URL (with cache-buster) forces Next.js to render at request
    // time and pick up our newly-inserted active team.
    await page.goto(`/scrim?_=${Date.now()}`);

    const link = page
      .locator(`a[href="/team/${EXPECTED_SLUG}"]`)
      .filter({ hasText: TEAM_NAME })
      .first();
    await expect(link).toBeVisible({ timeout: 15000 });
  });

  test('slug collisions get a -2 suffix', async ({}) => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');
    test.skip(
      !migrationApplied,
      'Migration add_team_slug.sql not applied on this environment'
    );

    // Insert a second team with the same name; trigger should disambiguate.
    const { data: dup, error } = await supabaseTestClient!
      .from('teams')
      .insert({ name: TEAM_NAME, is_active: true })
      .select('id, slug')
      .single();
    if (error) throw error;
    expect(dup!.slug).toBe(`${EXPECTED_SLUG}-2`);

    await supabaseTestClient!.from('teams').delete().eq('id', dup!.id);
  });
});
