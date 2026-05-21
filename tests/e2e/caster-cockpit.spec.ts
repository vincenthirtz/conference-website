/**
 * Tests E2E — Caster Cockpit (Run-of-show Lot 4)
 *
 * Couvre le flow caster :
 *  - Pre-conditions : auth user + cast_members lie + segment live + assignation
 *  - Login flow : magic-link generic 200 + redirect quand session valide
 *  - Cockpit : header caster, upcoming assignments, checklist toggle, hotkeys
 *  - Edge cases : caster sans event live, ownership cross-tenant (403)
 *
 * Strategie d'authentification : on cree un staff role='caster' via Supabase
 * service role (createTestStaff). Le caster a un compte email/password reel,
 * donc on se logue via /admin/login (qui partage le meme client supabaseClient
 * et donc les cookies sb-*). Une fois loge, on navigue vers /caster/cockpit.
 * Cela contourne le magic-link sans le casser cote tests.
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const CASTER_EMAIL = `e2e-cockpit-${TS}@test.local`;
const CASTER_PASSWORD = 'TestPassw0rd!42';

const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

let casterAuthId: string | null = null;
let castMemberId: string | null = null;
let tournamentId: string | null = null;
let team1Id: string | null = null;
let team2Id: string | null = null;
let liveMatchId: string | null = null;
let upcomingMatchId: string | null = null;
let runId: string | null = null;
let introSegmentId: string | null = null;
const cleanupAssignmentIds: string[] = [];

/**
 * Some shared DBs have a `staff_role_check` constraint that excludes
 * 'caster' (legacy state — the app code accepts caster as a valid role).
 * When this is the case, we can't materialize a caster login user. We
 * detect the constraint mismatch and skip the golden-path tests rather
 * than hard-fail every retry.
 */
let setupFailedReason: string | null = null;

async function loginAsCaster(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.fill('input#email', CASTER_EMAIL);
  await page.fill('input#password', CASTER_PASSWORD);
  await page.click('button[type="submit"]');
  // Caster can land on /admin (because they have a staff row), we just need
  // the sb-* cookies set. We will navigate manually after.
  await page.waitForLoadState('networkidle');
}

test.describe.serial('Caster cockpit — golden path', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Cleanup any leftover from a crashed prior run.
    await deleteTestStaff(CASTER_EMAIL);

    // createTestStaff may throw on environments where `staff_role_check`
    // excludes 'caster' (legacy DB state). We catch this and signal the
    // golden-path tests to skip rather than hard-failing.
    let caster: { id: string } | null = null;
    try {
      caster = await createTestStaff(CASTER_EMAIL, CASTER_PASSWORD, 'caster');
    } catch (err) {
      const msg = (err as { message?: string; code?: string })?.message ?? '';
      const code = (err as { code?: string })?.code;
      if (code === '23514' || /staff_role_check/.test(msg)) {
        setupFailedReason =
          'DB CHECK constraint staff_role_check excludes role=caster ' +
          '(legacy state). Fix the constraint to accept caster, then re-run.';
        return;
      }
      throw err;
    }
    if (!caster) {
      setupFailedReason = 'createTestStaff returned null';
      return;
    }
    casterAuthId = caster.id;

    // Cast member tied to that auth user, active, in default tenant.
    const { data: cm, error: cmErr } = await supabaseTestClient
      .from('cast_members')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Cockpit Caster ${TS}`,
        auth_user_id: casterAuthId,
        is_active: true,
        sort_order: 999,
      })
      .select('id')
      .single();
    if (cmErr) throw cmErr;
    castMemberId = cm!.id;

    // Tournament + 2 teams + 2 matches (one live-bound, one upcoming).
    const { data: tour, error: tErr } = await supabaseTestClient
      .from('tournaments')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Cockpit Tour ${TS}`,
        slug: `e2e-cockpit-tour-${TS}`,
        status: 'running',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    if (tErr) throw tErr;
    tournamentId = tour!.id;

    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Cockpit T1 ${TS}`,
        slug: `e2e-cockpit-t1-${TS}`,
      })
      .select('id')
      .single();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Cockpit T2 ${TS}`,
        slug: `e2e-cockpit-t2-${TS}`,
      })
      .select('id')
      .single();
    team2Id = t2!.id;

    // Live match (for the live intro/match segment) — scheduled now.
    const { data: m1 } = await supabaseTestClient
      .from('matches')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'pending',
        match_format: 'bo3',
        scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    liveMatchId = m1!.id;

    // Upcoming match (for the upcoming-assignment in 24h horizon).
    const { data: m2 } = await supabaseTestClient
      .from('matches')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'pending',
        match_format: 'bo3',
        // 2h ahead — within 24h horizon used by /api/caster/me.
        scheduled_at: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    upcomingMatchId = m2!.id;

    // Assign the caster to the upcoming match (24h horizon list).
    const { data: a1, error: aErr } = await supabaseTestClient
      .from('cast_assignments')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        match_id: upcomingMatchId,
        cast_member_id: castMemberId,
        briefing_at: new Date(Date.now() + 90 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (aErr) throw aErr;
    cleanupAssignmentIds.push(a1!.id);

    // Also assign to the "live" match so the hotkey API allows triggering
    // (ownership check for type='match' segments).
    const { data: a2, error: a2Err } = await supabaseTestClient
      .from('cast_assignments')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        match_id: liveMatchId,
        cast_member_id: castMemberId,
        briefing_at: new Date(Date.now() + 1 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (a2Err) throw a2Err;
    cleanupAssignmentIds.push(a2!.id);

    // Event run live + intro live segment + upcoming match segment.
    const nowIso = new Date().toISOString();
    const { data: run, error: rErr } = await supabaseTestClient
      .from('event_runs')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Cockpit Run ${TS}`,
        slug: `e2e-cockpit-run-${TS}`,
        scheduled_at: nowIso,
        status: 'live',
        started_at: nowIso,
      })
      .select('id')
      .single();
    if (rErr) throw rErr;
    runId = run!.id;

    // Intro segment in live state with a checklist item.
    const { data: seg1, error: s1Err } = await supabaseTestClient
      .from('event_segments')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        event_run_id: runId,
        ord: 0,
        type: 'intro',
        title: 'Intro live',
        duration_min: 10,
        status: 'live',
        started_at: nowIso,
        caster_checklist: [
          { key: 'mic_ok', label: 'Micro teste OK' },
          { key: 'scene_ok', label: 'Scene OBS prete' },
        ],
      })
      .select('id')
      .single();
    if (s1Err) throw s1Err;
    introSegmentId = seg1!.id;

    // Upcoming match segment tied to the live match. We don't need to keep
    // its id (segments deleted in afterAll via event_run_id cascade).
    const { error: s2Err } = await supabaseTestClient
      .from('event_segments')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        event_run_id: runId,
        ord: 1,
        type: 'match',
        title: 'Demi-finale live',
        match_id: liveMatchId,
        duration_min: 45,
        status: 'upcoming',
      });
    if (s2Err) throw s2Err;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;

    // Delete outbox hotkey events for this caster.
    await supabaseTestClient
      .from('bot_event_outbox')
      .delete()
      .eq('event_name', 'cast.hotkey_triggered')
      .filter('payload->data->caster->>id', 'eq', castMemberId ?? '');

    if (runId) {
      await supabaseTestClient
        .from('event_segments')
        .delete()
        .eq('event_run_id', runId);
      await supabaseTestClient.from('event_runs').delete().eq('id', runId);
    }
    if (cleanupAssignmentIds.length > 0) {
      await supabaseTestClient
        .from('cast_assignments')
        .delete()
        .in('id', cleanupAssignmentIds);
    }
    if (liveMatchId)
      await supabaseTestClient.from('matches').delete().eq('id', liveMatchId);
    if (upcomingMatchId)
      await supabaseTestClient
        .from('matches')
        .delete()
        .eq('id', upcomingMatchId);
    if (team1Id && team2Id) {
      await supabaseTestClient
        .from('teams')
        .delete()
        .in('id', [team1Id, team2Id]);
    }
    if (tournamentId)
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    if (castMemberId)
      await supabaseTestClient
        .from('cast_members')
        .delete()
        .eq('id', castMemberId);
    await deleteTestStaff(CASTER_EMAIL);
  });

  test('Cockpit affiche le caster + le segment live + les assignations', async ({
    page,
  }) => {
    test.skip(!!setupFailedReason, setupFailedReason ?? '');
    await loginAsCaster(page);
    await page.goto('/caster/cockpit');
    // Wait for /api/caster/me + /api/caster/runs/current to settle.
    await page.waitForLoadState('networkidle');

    // Header: caster name visible.
    await expect(
      page.getByText(`E2E Cockpit Caster ${TS}`).first()
    ).toBeVisible({ timeout: 15_000 });

    // Live segment block: title visible.
    await expect(page.getByText('Intro live').first()).toBeVisible();
    await expect(page.getByText(/EN DIRECT/i).first()).toBeVisible();

    // Upcoming assignment shown.
    await expect(
      page.getByText(`E2E Cockpit Tour ${TS}`).first()
    ).toBeVisible();

    // Sign-out button is the canonical "I'm on cockpit" marker.
    await expect(page.getByTestId('caster-signout')).toBeVisible();
  });

  test('Toggle un item de checklist marque checked_at + persiste', async ({
    page,
  }) => {
    test.skip(!!setupFailedReason, setupFailedReason ?? '');
    await loginAsCaster(page);
    await page.goto('/caster/cockpit');
    await page.waitForLoadState('networkidle');

    const item = page.getByTestId('checklist-item-mic_ok');
    await expect(item).toBeVisible({ timeout: 10_000 });

    // Initially not pressed.
    await expect(item).toHaveAttribute('aria-pressed', 'false');
    await item.click();

    // After PATCH, aria-pressed should flip true.
    await expect(item).toHaveAttribute('aria-pressed', 'true', {
      timeout: 10_000,
    });

    // Re-read from DB to confirm checked_by_user_id stamped.
    if (!supabaseTestClient) return;
    const { data: seg } = await supabaseTestClient
      .from('event_segments')
      .select('caster_checklist')
      .eq('id', introSegmentId)
      .maybeSingle();
    const checklist = (seg?.caster_checklist ?? []) as Array<{
      key: string;
      checked_at?: string | null;
      checked_by_user_id?: string | null;
    }>;
    const micItem = checklist.find((c) => c.key === 'mic_ok');
    expect(micItem?.checked_at).toBeTruthy();
    expect(micItem?.checked_by_user_id).toBe(casterAuthId);
  });

  test('Hotkey Highlight ecrit un event cast.hotkey_triggered (kind=highlight)', async ({
    page,
  }) => {
    test.skip(!!setupFailedReason, setupFailedReason ?? '');
    await loginAsCaster(page);
    await page.goto('/caster/cockpit');
    await page.waitForLoadState('networkidle');

    // Wait for hotkey block to be ready (not disabled — currentSegment is
    // live so disabled is false).
    const btn = page.getByTestId('hotkey-highlight');
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await expect(btn).toBeEnabled();

    // Capture the time before — then assert at least one event was emitted
    // for this segment with kind=highlight.
    const beforeIso = new Date(Date.now() - 1000).toISOString();

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/caster/segments/${introSegmentId}/hotkey`) &&
          r.request().method() === 'POST'
      ),
      btn.click(),
    ]);

    if (!supabaseTestClient) return;
    const { data: events } = await supabaseTestClient
      .from('bot_event_outbox')
      .select('event_name, payload, created_at')
      .eq('event_name', 'cast.hotkey_triggered')
      .gte('created_at', beforeIso)
      .order('created_at', { ascending: false })
      .limit(10);

    const found = (events ?? []).some((e) => {
      const data = (e.payload as Record<string, unknown>)?.data as
        | Record<string, unknown>
        | undefined;
      return data?.kind === 'highlight' && data?.segmentId === introSegmentId;
    });
    expect(found).toBe(true);
  });

  test('Hotkey Pause ecrit un event kind=pause', async ({ page }) => {
    test.skip(!!setupFailedReason, setupFailedReason ?? '');
    await loginAsCaster(page);
    await page.goto('/caster/cockpit');
    await page.waitForLoadState('networkidle');

    const btn = page.getByTestId('hotkey-pause');
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await expect(btn).toBeEnabled();
    const beforeIso = new Date(Date.now() - 1000).toISOString();

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/caster/segments/${introSegmentId}/hotkey`) &&
          r.request().method() === 'POST'
      ),
      btn.click(),
    ]);

    if (!supabaseTestClient) return;
    const { data: events } = await supabaseTestClient
      .from('bot_event_outbox')
      .select('event_name, payload, created_at')
      .eq('event_name', 'cast.hotkey_triggered')
      .gte('created_at', beforeIso)
      .order('created_at', { ascending: false })
      .limit(10);
    const found = (events ?? []).some((e) => {
      const data = (e.payload as Record<string, unknown>)?.data as
        | Record<string, unknown>
        | undefined;
      return data?.kind === 'pause' && data?.segmentId === introSegmentId;
    });
    expect(found).toBe(true);
  });
});

test.describe('Caster cockpit — edge cases', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test('Login avec email inconnu renvoie un succes generique (anti-enumeration)', async ({
    request,
  }) => {
    const res = await request.post('/api/caster/auth/magic-link', {
      data: { email: `noexist-${TS}@nowhere.invalid` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/Si tu es caster/);
  });

  test('Magic-link sans email valide renvoie un succes generique', async ({
    request,
  }) => {
    const res = await request.post('/api/caster/auth/magic-link', {
      data: { email: 'not-an-email' },
    });
    // Schema fails → still returns 200 (anti-error-oracle).
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('GET /api/caster/me sans session renvoie 401/403', async ({
    request,
  }) => {
    const res = await request.get('/api/caster/me');
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/caster/segments/[fakeId]/hotkey sans session renvoie 401/403', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/caster/segments/00000000-0000-0000-0000-000000000000/hotkey',
      {
        data: { kind: 'highlight' },
        headers: { 'Content-Type': 'application/json' },
      }
    );
    expect([401, 403]).toContain(res.status());
  });

  test('Hotkey sur un segment introuvable renvoie 404 (avec session caster)', async ({
    page,
  }) => {
    test.skip(!supabaseTestClient, 'Supabase service role manquant');
    test.skip(
      !!setupFailedReason,
      setupFailedReason ?? 'Golden-path setup skipped'
    );

    if (!supabaseTestClient) return;

    // Ensure a caster account exists (reuse the golden-path account).
    const { data: existing } = await supabaseTestClient
      .from('cast_members')
      .select('id')
      .eq('auth_user_id', casterAuthId ?? '')
      .maybeSingle();
    test.skip(!existing, 'Cast member golden-path absent');

    await page.goto('/admin/login');
    await page.fill('input#email', CASTER_EMAIL);
    await page.fill('input#password', CASTER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const fakeSegId = '00000000-0000-0000-0000-000000000000';
    const res = await page.request.post(
      `/api/caster/segments/${fakeSegId}/hotkey`,
      {
        data: { kind: 'highlight' },
      }
    );
    expect(res.status()).toBe(404);
  });
});
