/**
 * Tests E2E — Director cues -> caster cockpit ack flow (Run-of-show lots 5-7)
 *
 * Happy path :
 *   1. Manager se loge, ouvre /admin/events/[runId]/director sur un run live.
 *   2. Caster se loge, ouvre /caster/cockpit.
 *   3. Manager envoie un cue urgent depuis le CueComposer.
 *   4. Cockpit recoit le cue (realtime + poll fallback) et affiche
 *      UrgentCueModal (role=alertdialog).
 *   5. Caster clique "Vu" -> ack.
 *   6. Manager voit le ack_count passer de 0/1 a 1/1 sur le CueFeed.
 *
 * Strategie d'auth : on cree un staff manager + un staff caster via
 * Supabase service role (cf. createTestStaff). Login via /login pour
 * les deux (le caster a un staff row + cast_members lie, ce qui debloque
 * le cockpit via la session staff standard).
 *
 * Setup pattern mimique caster-cockpit.spec.ts.
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const MANAGER_EMAIL = `e2e-cues-mgr-${TS}@test.local`;
const MANAGER_PASSWORD = 'TestPassw0rd!42';
const CASTER_EMAIL = `e2e-cues-cst-${TS}@test.local`;
const CASTER_PASSWORD = 'TestPassw0rd!42';

const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

let managerAuthId: string | null = null;
let casterAuthId: string | null = null;
let castMemberId: string | null = null;
let runId: string | null = null;
let setupFailedReason: string | null = null;

async function loginVia(
  page: import('@playwright/test').Page,
  email: string,
  password: string
) {
  await page.goto('/login');
  await page.fill('input#email', email);
  await page.fill('input#password', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
}

test.describe.serial('Director cues -> cockpit ack flow', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await deleteTestStaff(MANAGER_EMAIL);
    await deleteTestStaff(CASTER_EMAIL);

    // Manager
    try {
      const mgr = await createTestStaff(
        MANAGER_EMAIL,
        MANAGER_PASSWORD,
        'admin'
      );
      managerAuthId = mgr!.id;
    } catch (err) {
      setupFailedReason = `createTestStaff(manager) failed: ${(err as Error)?.message}`;
      return;
    }

    // Caster + cast_members link
    try {
      const cst = await createTestStaff(
        CASTER_EMAIL,
        CASTER_PASSWORD,
        'caster'
      );
      casterAuthId = cst!.id;
    } catch (err) {
      const msg = (err as { message?: string; code?: string })?.message ?? '';
      const code = (err as { code?: string })?.code;
      if (code === '23514' || /staff_role_check/.test(msg)) {
        setupFailedReason =
          'staff_role_check exclut role=caster (DB legacy). Spec skip.';
        return;
      }
      throw err;
    }

    const { data: cm, error: cmErr } = await supabaseTestClient
      .from('cast_members')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Cues Caster ${TS}`,
        auth_user_id: casterAuthId,
        is_active: true,
        sort_order: 999,
      })
      .select('id')
      .single();
    if (cmErr) throw cmErr;
    castMemberId = cm!.id;

    // Event run live + 1 segment (pas besoin de match pour tester les cues).
    const nowIso = new Date().toISOString();
    const { data: run, error: rErr } = await supabaseTestClient
      .from('event_runs')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Cues Run ${TS}`,
        slug: `e2e-cues-run-${TS}`,
        scheduled_at: nowIso,
        status: 'live',
        started_at: nowIso,
      })
      .select('id')
      .single();
    if (rErr) throw rErr;
    runId = run!.id;

    const { error: sErr } = await supabaseTestClient
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
      });
    if (sErr) throw sErr;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;

    if (runId) {
      // Cues + acks cascade via FK ON DELETE CASCADE.
      await supabaseTestClient.from('event_cues').delete().eq('event_run_id', runId);
      await supabaseTestClient
        .from('event_segments')
        .delete()
        .eq('event_run_id', runId);
      await supabaseTestClient.from('event_runs').delete().eq('id', runId);
    }
    if (castMemberId) {
      await supabaseTestClient.from('caster_presence').delete().eq('cast_member_id', castMemberId);
      await supabaseTestClient.from('cast_members').delete().eq('id', castMemberId);
    }
    if (managerAuthId) await deleteTestStaff(MANAGER_EMAIL);
    if (casterAuthId) await deleteTestStaff(CASTER_EMAIL);
  });

  test('manager sends urgent cue -> cockpit modal -> ack -> feed 1/1', async ({
    browser,
  }) => {
    test.skip(!!setupFailedReason, setupFailedReason ?? '');
    test.skip(!runId, 'run not seeded');

    // 1. Manager context
    const managerCtx = await browser.newContext();
    const managerPage = await managerCtx.newPage();
    await loginVia(managerPage, MANAGER_EMAIL, MANAGER_PASSWORD);
    await managerPage.goto(`/admin/events/${runId}/director`);

    // CueComposer doit etre visible (run live -> textarea non disabled).
    const composer = managerPage.getByTestId('cue-composer-textarea');
    await expect(composer).toBeVisible({ timeout: 15_000 });

    // 2. Caster context
    const casterCtx = await browser.newContext();
    const casterPage = await casterCtx.newPage();
    await loginVia(casterPage, CASTER_EMAIL, CASTER_PASSWORD);
    await casterPage.goto('/caster/cockpit');
    // On attend que le cockpit ait charge (le header caster apparait).
    await casterPage.waitForLoadState('networkidle');

    // 3. Manager envoie un cue urgent
    await composer.fill('Test e2e urgent action');
    await managerPage.getByTestId('cue-composer-severity-urgent').click();
    await Promise.all([
      managerPage.waitForResponse(
        (r) =>
          /\/api\/admin\/events\/[^/]+\/cues$/.test(r.url()) &&
          r.request().method() === 'POST' &&
          r.status() < 400
      ),
      managerPage.getByTestId('cue-composer-submit').click(),
    ]);

    // 4. Cockpit recoit l'urgent modal (realtime + poll fallback < 30s)
    const modal = casterPage.getByTestId('urgent-cue-modal');
    await expect(modal).toBeVisible({ timeout: 35_000 });
    await expect(modal).toContainText('Test e2e urgent action');

    // 5. Caster ack
    const ackButton = casterPage.getByTestId('urgent-cue-ack');
    await Promise.all([
      casterPage.waitForResponse(
        (r) =>
          /\/api\/caster\/cues\/[^/]+\/ack$/.test(r.url()) &&
          r.request().method() === 'POST' &&
          r.status() < 400
      ),
      ackButton.click(),
    ]);
    await expect(modal).toBeHidden({ timeout: 5_000 });

    // 6. Manager voit le ack count (refresh CueFeed poll 5s)
    const ackCount = managerPage
      .getByTestId(/^cue-feed-ack-count-/)
      .first();
    await expect(ackCount).toHaveText('1/1', { timeout: 15_000 });

    await managerCtx.close();
    await casterCtx.close();
  });
});
