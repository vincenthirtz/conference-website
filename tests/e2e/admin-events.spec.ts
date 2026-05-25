/**
 * Tests E2E — Run-of-show Director (Lots 2-4)
 *
 * Couvre le flow staff admin :
 *  - /admin/events : creation d'un event_run depuis le modal
 *  - /admin/events/[runId]/director : ajout segments, start run, start/end
 *    segments, suppression
 *  - Verification que les transitions de segment ecrivent un event
 *    `event_segment.transitioned` dans bot_event_outbox
 *
 * Les tests utilisent un user staff role='admin' (le start run requiert
 * 'admin' alors que la plupart des autres routes acceptent 'manager').
 *
 * On s'appuie sur les `data-testid` ajoutes aux composants Director (Lot 3)
 * pour stabiliser les selecteurs malgre les classes Tailwind.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const STAFF_EMAIL = `e2e-events-${TS}@test.local`;
const STAFF_PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

// Slug stable scope au timestamp pour faciliter le cleanup en cas de crash.
const RUN_NAME = `E2E Director ${TS}`;
const RUN_SLUG = `e2e-director-${TS}`;

let tournamentId: string;
let team1Id: string;
let team2Id: string;
let matchId: string;
let createdRunId: string | null = null;
let createdSegmentIds: string[] = [];

async function setCookieConsent(page: import('@playwright/test').Page) {
  // Pre-set cookie consent so the banner doesn't intercept clicks. Shape
  // must match `useCookieConsent` (version + preferences + consentDate).
  await page.evaluate(() => {
    localStorage.setItem(
      'cookie_consent',
      JSON.stringify({
        version: '1.0',
        preferences: {
          essential: true,
          functional: true,
          analytics: true,
          marketing: true,
        },
        consentDate: new Date().toISOString(),
      })
    );
  });
}

async function loginAsStaff(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await setCookieConsent(page);
  await page.fill('input#email', STAFF_EMAIL);
  await page.fill('input#password', STAFF_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  // Re-apply consent in case the post-login reload wiped storage view.
  await setCookieConsent(page);
}

/**
 * Next.js dev mode renders a `<nextjs-portal>` overlay for hydration / runtime
 * errors that intercepts pointer events. The Director page has a known
 * hydration warning in dev mode (date formatting locale mismatch). We
 * dismiss the portal so it doesn't block clicks. No-op in prod / when not
 * present.
 */
async function dismissNextDevOverlay(page: import('@playwright/test').Page) {
  // 1) Hide via stylesheet (survives re-mounts).
  await page
    .addStyleTag({
      content:
        'nextjs-portal, nextjs-portal * { display: none !important; pointer-events: none !important; }',
    })
    .catch(() => undefined);
  // 2) Remove existing portal nodes for good measure.
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal').forEach((el) => el.remove());
  });
}

test.describe.serial('Admin Director — golden path', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Clean any leftover staff from a prior crashed run.
    await deleteTestStaff(STAFF_EMAIL);

    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');

    // Tournament + 2 teams + 1 match (scoped to default tenant so the staff
    // user resolves to the same tenant_id via cookie fallback).
    const { data: tour, error: tourErr } = await supabaseTestClient
      .from('tournaments')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Director Tour ${TS}`,
        slug: `e2e-director-tour-${TS}`,
        status: 'running',
        game: 'overwatch',
      })
      .select('id')
      .single();
    if (tourErr) throw tourErr;
    tournamentId = tour!.id;

    const { data: t1, error: t1Err } = await supabaseTestClient
      .from('teams')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Director T1 ${TS}`,
        slug: `e2e-director-t1-${TS}`,
      })
      .select('id')
      .single();
    if (t1Err) throw t1Err;
    team1Id = t1!.id;

    const { data: t2, error: t2Err } = await supabaseTestClient
      .from('teams')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Director T2 ${TS}`,
        slug: `e2e-director-t2-${TS}`,
      })
      .select('id')
      .single();
    if (t2Err) throw t2Err;
    team2Id = t2!.id;

    const { data: m, error: mErr } = await supabaseTestClient
      .from('matches')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'pending',
        match_format: 'bo3',
      })
      .select('id')
      .single();
    if (mErr) throw mErr;
    matchId = m!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;

    // Cleanup is idempotent — order matters (segments → run → outbox → match
    // → teams → tournament → staff).
    if (createdRunId) {
      await supabaseTestClient
        .from('event_segments')
        .delete()
        .eq('event_run_id', createdRunId);
      await supabaseTestClient
        .from('event_runs')
        .delete()
        .eq('id', createdRunId);
    }
    // Defensive: also cleanup by slug, in case createdRunId got lost.
    await supabaseTestClient.from('event_runs').delete().eq('slug', RUN_SLUG);

    // Outbox events emitted by start/end. We do not care about ack status —
    // just drop all rows referencing our run/segments to avoid polluting the
    // poller backlog.
    if (createdRunId) {
      await supabaseTestClient
        .from('bot_event_outbox')
        .delete()
        .like('payload->>id', '%')
        .filter('payload->data->>runId', 'eq', createdRunId);
    }

    if (matchId) {
      await supabaseTestClient.from('matches').delete().eq('id', matchId);
    }
    if (team1Id && team2Id) {
      await supabaseTestClient
        .from('teams')
        .delete()
        .in('id', [team1Id, team2Id]);
    }
    if (tournamentId) {
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    }

    await deleteTestStaff(STAFF_EMAIL);
  });

  test('Cree un event depuis /admin/events et navigue vers le Director', async ({
    page,
  }) => {
    await loginAsStaff(page);
    await page.goto('/admin/events');
    await page.waitForLoadState('networkidle');
    await dismissNextDevOverlay(page);

    // Open create modal
    await page.getByTestId('events-new').first().click();
    await expect(page.getByTestId('create-run-modal')).toBeVisible();

    await page.getByTestId('create-run-name').fill(RUN_NAME);

    // Slug auto-generated, but assert + override to a known stable slug for
    // teardown determinism.
    const slugInput = page.getByTestId('create-run-slug');
    await expect(slugInput).not.toHaveValue('');
    await slugInput.fill(RUN_SLUG);

    // datetime-local needs a YYYY-MM-DDTHH:mm value. Schedule 1h ahead.
    const futureDate = new Date(Date.now() + 60 * 60_000);
    const yyyy = futureDate.getFullYear();
    const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
    const dd = String(futureDate.getDate()).padStart(2, '0');
    const hh = String(futureDate.getHours()).padStart(2, '0');
    const mi = String(futureDate.getMinutes()).padStart(2, '0');
    await page
      .getByTestId('create-run-scheduled')
      .fill(`${yyyy}-${mm}-${dd}T${hh}:${mi}`);

    await page.getByTestId('create-run-description').fill('E2E run desc');

    // Submit + wait for the POST to complete, redirect to /director.
    await Promise.all([
      page.waitForURL(/\/admin\/events\/[0-9a-f-]+\/director/, {
        timeout: 15_000,
      }),
      page.getByTestId('create-run-submit').click(),
    ]);

    const url = new URL(page.url());
    const match = url.pathname.match(/\/admin\/events\/([0-9a-f-]+)\/director/);
    expect(match).toBeTruthy();
    createdRunId = match![1];
    expect(createdRunId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    // Header should show "draft".
    await expect(page.getByTestId('run-status-header-actions')).toHaveAttribute(
      'data-run-status',
      'draft'
    );
    await expect(page.getByTestId('run-start')).toBeVisible();
  });

  test('Ajoute 3 segments (intro / match / outro) dans la timeline', async ({
    page,
  }) => {
    test.skip(!createdRunId, 'Setup precedent a echoue');
    await loginAsStaff(page);
    await page.goto(`/admin/events/${createdRunId}/director`);
    await page.waitForLoadState('networkidle');
    await dismissNextDevOverlay(page);

    // Empty state → click "Ajouter un segment"
    await page.getByTestId('timeline-add-empty').click();
    await expect(page.getByTestId('add-segment-modal')).toBeVisible();
    await page.getByTestId('add-segment-type').selectOption('intro');
    await page.getByTestId('add-segment-title-input').fill('Intro caster');
    await page.getByTestId('add-segment-duration').fill('5');
    await page.getByTestId('add-segment-submit').click();
    await expect(page.getByTestId('add-segment-modal')).toBeHidden();

    // 2nd segment: match (autocomplete picker — accepte un UUID colle)
    await page.getByTestId('timeline-add').click();
    await page.getByTestId('add-segment-type').selectOption('match');
    await page.getByTestId('add-segment-title-input').fill('Demi-finale');
    await page
      .getByTestId('add-segment-match-id')
      .getByTestId('match-picker-input')
      .fill(matchId);
    await page.getByTestId('add-segment-duration').fill('30');
    await page.getByTestId('add-segment-submit').click();
    await expect(page.getByTestId('add-segment-modal')).toBeHidden();

    // 3rd segment: outro
    await page.getByTestId('timeline-add').click();
    await page.getByTestId('add-segment-type').selectOption('outro');
    await page.getByTestId('add-segment-title-input').fill('Goodbye');
    await page.getByTestId('add-segment-duration').fill('5');
    await page.getByTestId('add-segment-submit').click();
    await expect(page.getByTestId('add-segment-modal')).toBeHidden();

    // 3 segments visible with status upcoming
    const cards = page.locator('[data-testid^="segment-card-"]');
    await expect(cards).toHaveCount(3);
    const statuses = await cards.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.segmentStatus)
    );
    expect(statuses).toEqual(['upcoming', 'upcoming', 'upcoming']);

    const types = await cards.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.segmentType)
    );
    expect(types).toEqual(['intro', 'match', 'outro']);

    // Capture ids for later assertions.
    const ids = await cards.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getAttribute('data-testid'))
    );
    createdSegmentIds = ids
      .filter((x): x is string => !!x)
      .map((x) => x.replace('segment-card-', ''));
    expect(createdSegmentIds.length).toBe(3);
  });

  test('Reorder via API (drag-drop est non-trivial avec HTML5) puis recharge', async ({
    page,
  }) => {
    test.skip(!createdRunId, 'Setup precedent a echoue');
    test.skip(
      createdSegmentIds.length !== 3,
      'Segments precedents non ajoutes'
    );

    // HTML5 native drag-drop est difficile a piloter avec Playwright (les
    // events `dragstart`/`drop` sont synthetiques). On declenche le reorder
    // via l'API admin directement, puis on verifie que l'UI le reflete au
    // refresh. C'est suffisant pour valider la persistance du reorder.
    if (!supabaseTestClient) return;

    // Original: [intro, match, outro]. Cible: [match, intro, outro].
    const [introId, matchSegId, outroId] = createdSegmentIds;
    const newOrder = [matchSegId, introId, outroId];

    // Auth via supabase signin (UI session) — on reuse les cookies du page.
    await loginAsStaff(page);

    // Generate an Idempotency-Key for the POST.
    const idempKey = `e2e-reorder-${TS}-${Math.random().toString(36).slice(2)}`;

    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    const apiRes = await page.request.post(
      `/api/admin/events/${createdRunId}/segments/reorder`,
      {
        data: { orderedIds: newOrder },
        headers: {
          'Idempotency-Key': idempKey,
          // CSRF check requires Origin = host. page.request doesn't always
          // set Origin on direct calls; set it explicitly.
          Origin: baseUrl,
        },
      }
    );
    expect(apiRes.status()).toBe(200);

    // Reload + verify the order persists.
    await page.goto(`/admin/events/${createdRunId}/director`);
    await page.waitForLoadState('networkidle');
    await dismissNextDevOverlay(page);

    const cards = page.locator('[data-testid^="segment-card-"]');
    await expect(cards).toHaveCount(3);
    const orderedIds = await cards.evaluateAll((els) =>
      els.map((el) =>
        (el as HTMLElement)
          .getAttribute('data-testid')!
          .replace('segment-card-', '')
      )
    );
    expect(orderedIds).toEqual(newOrder);
  });

  test('Demarre le run + demarre le 1er segment et verifie outbox', async ({
    page,
  }) => {
    test.skip(!createdRunId, 'Setup precedent a echoue');
    test.skip(
      createdSegmentIds.length !== 3,
      'Segments precedents non ajoutes'
    );

    await loginAsStaff(page);
    await page.goto(`/admin/events/${createdRunId}/director`);
    await page.waitForLoadState('networkidle');
    await dismissNextDevOverlay(page);

    // Start the run.
    await page.getByTestId('run-start').click();
    await expect(page.getByTestId('run-status-header-actions')).toHaveAttribute(
      'data-run-status',
      'live',
      { timeout: 10_000 }
    );
    await expect(page.getByTestId('run-end')).toBeVisible();

    // Get the first segment in the current order (match after reorder).
    const cards = page.locator('[data-testid^="segment-card-"]');
    const firstId = await cards
      .first()
      .evaluate((el) =>
        (el as HTMLElement)
          .getAttribute('data-testid')!
          .replace('segment-card-', '')
      );

    // Start the first segment.
    await page.getByTestId(`segment-start-${firstId}`).click();

    // The card now exposes status=live.
    await expect(page.getByTestId(`segment-card-${firstId}`)).toHaveAttribute(
      'data-segment-status',
      'live',
      { timeout: 10_000 }
    );

    // Outbox check: at least one event_segment.transitioned event for this
    // segment in pending status. We poll up to ~5s because the emit is
    // best-effort (void promise) — it may land just after the response.
    if (!supabaseTestClient) return;
    let outboxFound = false;
    for (let i = 0; i < 10; i += 1) {
      const { data: events } = await supabaseTestClient
        .from('bot_event_outbox')
        .select('event_name, payload')
        .eq('event_name', 'event_segment.transitioned')
        .order('created_at', { ascending: false })
        .limit(20);
      outboxFound = (events ?? []).some((e) => {
        const data = (e.payload as Record<string, unknown>)?.data as
          | Record<string, unknown>
          | undefined;
        return data?.segmentId === firstId && data?.toStatus === 'live';
      });
      if (outboxFound) break;
      await page.waitForTimeout(500);
    }
    expect(outboxFound).toBe(true);

    // End the first segment.
    await page.getByTestId(`segment-end-${firstId}`).click();
    await expect(page.getByTestId(`segment-card-${firstId}`)).toHaveAttribute(
      'data-segment-status',
      'done',
      { timeout: 10_000 }
    );
  });

  test('Terminer le run met tous les segments restants en done', async ({
    page,
  }) => {
    test.skip(!createdRunId, 'Setup precedent a echoue');
    test.skip(
      createdSegmentIds.length !== 3,
      'Segments precedents non ajoutes'
    );

    await loginAsStaff(page);
    await page.goto(`/admin/events/${createdRunId}/director`);
    await page.waitForLoadState('networkidle');
    await dismissNextDevOverlay(page);

    await page.getByTestId('run-end').click();

    // Custom confirm dialog (not browser native). Confirm via the
    // confirm button labelled "Terminer".
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();

    // The header now shows "done" status.
    await expect(page.getByTestId('run-status-header-actions')).toHaveAttribute(
      'data-run-status',
      'done',
      { timeout: 15_000 }
    );
    await expect(page.getByTestId('run-done-label')).toBeVisible();

    // All segments should now be either 'done' or 'skipped' (no 'upcoming'
    // remains). Use the data-segment-status attribute as source of truth.
    const cards = page.locator('[data-testid^="segment-card-"]');
    const statuses = await cards.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.segmentStatus)
    );
    expect(statuses.every((s) => s === 'done' || s === 'skipped')).toBe(true);
  });
});

test.describe('Admin Director — edge cases', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  const TS2 = TS + 1; // separate slug namespace
  const EDGE_STAFF_EMAIL = `e2e-events-edge-${TS2}@test.local`;
  const EDGE_PASSWORD = STAFF_PASSWORD;
  let edgeRunId: string | null = null;
  let staffAccessToken: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    await deleteTestStaff(EDGE_STAFF_EMAIL);
    await createTestStaff(EDGE_STAFF_EMAIL, EDGE_PASSWORD, 'admin');

    // Get an access token to call admin APIs directly (no CSRF needed when
    // Bearer is set).
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await anonClient.auth.signInWithPassword({
      email: EDGE_STAFF_EMAIL,
      password: EDGE_PASSWORD,
    });
    staffAccessToken = data?.session?.access_token ?? null;

    // Create a run directly via API (faster than UI).
    if (staffAccessToken) {
      const createRes = await fetch(
        `${process.env.TEST_BASE_URL || 'http://localhost:3000'}/api/admin/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${staffAccessToken}`,
            'Idempotency-Key': `e2e-edge-create-${TS2}`,
          },
          body: JSON.stringify({
            name: `E2E Edge ${TS2}`,
            slug: `e2e-edge-${TS2}`,
            scheduled_at: new Date(Date.now() + 60 * 60_000).toISOString(),
          }),
        }
      );
      if (createRes.ok) {
        const json = (await createRes.json()) as { id: string };
        edgeRunId = json.id;
      }
    }
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (edgeRunId) {
      await supabaseTestClient
        .from('event_segments')
        .delete()
        .eq('event_run_id', edgeRunId);
      await supabaseTestClient.from('event_runs').delete().eq('id', edgeRunId);
    }
    await supabaseTestClient
      .from('event_runs')
      .delete()
      .eq('slug', `e2e-edge-${TS2}`);
    await deleteTestStaff(EDGE_STAFF_EMAIL);
  });

  test('Demarrer un segment qui n existe pas renvoie 404', async ({
    request,
  }) => {
    test.skip(!edgeRunId || !staffAccessToken, 'Setup edge a echoue');
    const fakeSegId = '00000000-0000-0000-0000-000000000000';
    const res = await request.post(
      `/api/admin/events/${edgeRunId}/segments/${fakeSegId}/start`,
      {
        headers: {
          Authorization: `Bearer ${staffAccessToken}`,
          'Idempotency-Key': `e2e-edge-404-${TS2}`,
        },
      }
    );
    expect(res.status()).toBe(404);
  });

  test('Reorder avec un id manquant renvoie 400', async ({ request }) => {
    test.skip(!edgeRunId || !staffAccessToken, 'Setup edge a echoue');
    const res = await request.post(
      `/api/admin/events/${edgeRunId}/segments/reorder`,
      {
        data: { orderedIds: [] }, // empty → schema min(1) violation
        headers: {
          Authorization: `Bearer ${staffAccessToken}`,
          'Idempotency-Key': `e2e-edge-reorder-${TS2}`,
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('Demarrer un run deja done renvoie 409', async ({ request }) => {
    test.skip(!edgeRunId || !staffAccessToken, 'Setup edge a echoue');

    // 1. Start
    await request.post(`/api/admin/events/${edgeRunId}/start`, {
      headers: {
        Authorization: `Bearer ${staffAccessToken}`,
        'Idempotency-Key': `e2e-edge-start-${TS2}-a`,
      },
    });
    // 2. End
    await request.post(`/api/admin/events/${edgeRunId}/end`, {
      headers: {
        Authorization: `Bearer ${staffAccessToken}`,
        'Idempotency-Key': `e2e-edge-end-${TS2}`,
      },
    });
    // 3. Try to start again
    const res = await request.post(`/api/admin/events/${edgeRunId}/start`, {
      headers: {
        Authorization: `Bearer ${staffAccessToken}`,
        'Idempotency-Key': `e2e-edge-start-${TS2}-b`,
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('RUN_ALREADY_DONE');
  });
});
