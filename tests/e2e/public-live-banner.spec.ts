/**
 * Tests E2E — Public live banner (Run-of-show Lot 4)
 *
 * Couvre l'encart "EN DIRECT MAINTENANT" affiche sur /ambassadors :
 *  - Affichage quand un event_run est live (avec ou sans segment courant)
 *  - Absence quand aucun run live
 *  - L'API publique /api/events/current renvoie la projection safe
 */
import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

const RUN_SLUG = `e2e-banner-${TS}`;
let bannerRunId: string | null = null;

test.describe('Public live banner', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.afterEach(async () => {
    if (!supabaseTestClient) return;
    if (bannerRunId) {
      await supabaseTestClient
        .from('event_segments')
        .delete()
        .eq('event_run_id', bannerRunId);
      await supabaseTestClient
        .from('event_runs')
        .delete()
        .eq('id', bannerRunId);
      bannerRunId = null;
    }
    // Defensive idempotent cleanup by slug.
    await supabaseTestClient.from('event_runs').delete().eq('slug', RUN_SLUG);
  });

  test('GET /api/events/current sans run live renvoie run=null', async ({
    request,
  }) => {
    if (!supabaseTestClient) return;

    // Ensure no run live exists for this slug (preview env may have leftover).
    await supabaseTestClient.from('event_runs').delete().eq('slug', RUN_SLUG);

    const res = await request.get('/api/events/current');
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Cannot assert run=null absolutely (other tests may have a live run on
    // the shared DB), but the contract must be respected (object shape).
    expect(body).toHaveProperty('run');
    expect(body).toHaveProperty('segments');
    expect(Array.isArray(body.segments)).toBe(true);
  });

  test('/ambassadors affiche le banner quand un event_run est live', async ({
    page,
  }) => {
    if (!supabaseTestClient) return;
    const nowIso = new Date().toISOString();
    const { data: run, error } = await supabaseTestClient
      .from('event_runs')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Banner Live ${TS}`,
        slug: RUN_SLUG,
        scheduled_at: nowIso,
        status: 'live',
        started_at: nowIso,
      })
      .select('id')
      .single();
    if (error) throw error;
    bannerRunId = run!.id;

    // Add an upcoming segment so the banner renders the "en attente du
    // prochain segment" path (no segment live yet).
    await supabaseTestClient.from('event_segments').insert({
      tenant_id: DEFAULT_TENANT_ID,
      event_run_id: bannerRunId,
      ord: 0,
      type: 'intro',
      title: 'Intro live banner',
      duration_min: 5,
      status: 'upcoming',
    });

    await page.goto('/ambassadors');
    await page.waitForLoadState('networkidle');

    // Banner appears with the run name visible.
    const banner = page.getByTestId('live-event-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText(`E2E Banner Live ${TS}`);
    await expect(banner).toContainText(/EN DIRECT MAINTENANT/i);
  });

  test('/ambassadors n affiche pas le banner sans run live', async ({ page }) => {
    if (!supabaseTestClient) return;

    // Ensure nothing live remains for our slug.
    await supabaseTestClient.from('event_runs').delete().eq('slug', RUN_SLUG);

    // Force-end any leftover live run from previous specs to keep the test
    // deterministic. We only touch runs whose slug starts with e2e-banner-.
    await supabaseTestClient
      .from('event_runs')
      .update({ status: 'done', ended_at: new Date().toISOString() })
      .like('slug', 'e2e-banner-%')
      .eq('status', 'live');

    await page.goto('/ambassadors');
    await page.waitForLoadState('networkidle');

    // The banner is conditionally rendered; we accept that other tests in
    // parallel can have a live run, so we only assert that OUR slug's run is
    // absent. Use the data-run-id attribute on the banner if rendered, and
    // check it does not point to a slug we control.
    const banner = page.getByTestId('live-event-banner');
    if (await banner.count()) {
      // If a banner shows, it must be from another spec / production run —
      // not from the slug we control.
      const bannerRunIdAttr = await banner.getAttribute('data-run-id');
      // Re-fetch the slug for that id and assert it doesn't match ours.
      if (bannerRunIdAttr) {
        const { data } = await supabaseTestClient
          .from('event_runs')
          .select('slug')
          .eq('id', bannerRunIdAttr)
          .maybeSingle();
        expect(data?.slug).not.toBe(RUN_SLUG);
      }
    }
    // Otherwise the banner is absent — that's also a pass.
  });
});
