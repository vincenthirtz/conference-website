/**
 * Tests E2E — Cockpit caster : ack d'un cue urgent sous coupure réseau
 * (Run-of-show, feature #8 « porte de sortie hors-ligne / ack différé »).
 *
 * CONTEXTE / DÉCISION (lire avant de toucher ce fichier) :
 * ---------------------------------------------------------------------------
 * La cible initiale était la « porte de sortie hors-ligne » de la
 * UrgentCueModal : après 2 échecs réseau CONSÉCUTIFS de l'ack, un bouton
 * « Vu (hors ligne) » (data-testid=urgent-cue-ack-offline) doit apparaître ;
 * au clic il ferme la modal SANS poser acked_by_me (deferAck) et le hook
 * retente l'ack réel en fond jusqu'au retour réseau.
 *
 * Or ce chemin est INATTEIGNABLE via l'UI dans un vrai navigateur. Preuve
 * empirique (playwright) : le bouton « Vu » reste indéfiniment « Vu » et ne
 * passe jamais « Réessayer », le bouton hors-ligne n'apparaît jamais. Cause :
 *   - handleAck() (UrgentCueModal) appelle cueStream.ack() ;
 *   - ack() (useCueStream) fait une MàJ OPTIMISTE : acked_by_me=true → le cue
 *     sort de pendingUrgent → la modal se DÉMONTE ;
 *   - le POST échoue (réseau) → rollback acked_by_me=false → pendingUrgent
 *     revient → la modal se REMONTE, instance neuve, failCount RESET à 0 ;
 *   - le catch qui incrémente failCount s'exécute sur l'instance DÉMONTÉE
 *     (setState no-op). Donc failCount ne dépasse jamais 0 → showOfflineExit
 *     (failCount >= 2) reste toujours faux.
 * => La porte de sortie hors-ligne est du code mort en prod. C'est un défaut
 *    de PROD (composition ack optimiste ↔ modal), pas un défaut de test. Il
 *    doit être corrigé côté hooks/useCueStream.ts + components/Caster/
 *    UrgentCueModal.tsx (hand-off public-ui). Le test « feature #8 » complet
 *    est donc encodé en test.fixme() ci-dessous : il documente le comportement
 *    attendu et repassera vert dès le bug corrigé, sans faire échouer la CI.
 *
 * Un test d'intégration du hook (deferAck avec fetch mocké) n'est pas non plus
 * réalisable ici : pas de jsdom / @testing-library/react (interdit par la
 * politique zéro-dépendance, cf. vitest.config.ts) et useCueStream n'expose
 * aucune surface pure extraite (contrairement à buildAdminResourceUrl).
 *
 * CE QUI EST COUVERT ICI (chemin réel, atteignable, déterministe) : le trou de
 * couverture réel du chemin dégradé de l'ack urgent — director-cues-flow.spec
 * ne couvre que le golden path (ack qui réussit du premier coup). On vérifie :
 *   1. Un cue urgent → UrgentCueModal.
 *   2. Ack sous coupure réseau (route.abort) → l'ack ÉCHOUE, la modal reste
 *      ouverte, et le cue reste NON-acké dans le CueFeed (pas de faux ✓).
 *   3. Retour réseau + nouvel ack → le POST part réellement (200), la modal se
 *      ferme et le CueFeed passe au ✓ (event_cue_acks créé en DB).
 *
 * Stratégie d'auth : identique à caster-cockpit.spec.ts — staff role='caster'
 * via service role + login email/mdp réel, puis /caster/cockpit.
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const CASTER_EMAIL = `e2e-offline-ack-${TS}@test.local`;
const CASTER_PASSWORD = 'TestPassw0rd!42';

const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

// URL d'ack : segment dynamique + slash → regex (le glob page.route ne matche
// pas proprement `*/ack`).
const ACK_URL_RE = /\/api\/caster\/cues\/[0-9a-f-]{36}\/ack$/i;

let casterAuthId: string | null = null;
let castMemberId: string | null = null;
let runId: string | null = null;
let cueId: string | null = null;

// Même garde que le spec golden-path : certaines DB legacy ont un
// staff_role_check qui exclut 'caster'. On skippe proprement dans ce cas.
let setupFailedReason: string | null = null;

async function loginAsCaster(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input#email', CASTER_EMAIL);
  await page.fill('input#password', CASTER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
}

test.describe
  .serial('Cockpit caster — ack cue urgent sous coupure réseau', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await deleteTestStaff(CASTER_EMAIL);

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

    // Cast member actif lié au caster.
    const { data: cm, error: cmErr } = await supabaseTestClient
      .from('cast_members')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Offline Ack Caster ${TS}`,
        auth_user_id: casterAuthId,
        is_active: true,
        sort_order: 998,
      })
      .select('id')
      .single();
    if (cmErr) throw cmErr;
    castMemberId = cm!.id;

    // Event run LIVE (indispensable : liveRunId pilote useCueStream + CueFeed).
    const nowIso = new Date().toISOString();
    const { data: run, error: rErr } = await supabaseTestClient
      .from('event_runs')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name: `E2E Offline Ack Run ${TS}`,
        slug: `e2e-offline-ack-run-${TS}`,
        scheduled_at: nowIso,
        status: 'live',
        started_at: nowIso,
      })
      .select('id')
      .single();
    if (rErr) throw rErr;
    runId = run!.id;

    // Cue urgent NON acké → déclenche la UrgentCueModal au chargement.
    const { data: cue, error: cErr } = await supabaseTestClient
      .from('event_cues')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        event_run_id: runId,
        severity: 'urgent',
        body: `E2E URGENT — coupe la scène maintenant (${TS})`,
      })
      .select('id')
      .single();
    if (cErr) throw cErr;
    cueId = cue!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;

    if (cueId) {
      await supabaseTestClient
        .from('event_cue_acks')
        .delete()
        .eq('cue_id', cueId);
      await supabaseTestClient.from('event_cues').delete().eq('id', cueId);
    }
    if (runId) {
      await supabaseTestClient
        .from('event_cues')
        .delete()
        .eq('event_run_id', runId);
      await supabaseTestClient.from('event_runs').delete().eq('id', runId);
    }
    if (castMemberId)
      await supabaseTestClient
        .from('cast_members')
        .delete()
        .eq('id', castMemberId);
    await deleteTestStaff(CASTER_EMAIL);
  });

  // Isolation : les tests sont en describe.serial et partagent le MÊME cue seedé.
  // Le test dégradé acke ce cue pour de vrai à la fin → sans reset, le test
  // suivant trouverait le cue déjà acké et la UrgentCueModal n'apparaîtrait pas.
  // On repart donc d'un cue NON acké avant chaque test.
  test.beforeEach(async () => {
    if (supabaseTestClient && cueId) {
      await supabaseTestClient
        .from('event_cue_acks')
        .delete()
        .eq('cue_id', cueId);
    }
  });

  test('Ack échoue sous coupure réseau (pas de faux ✓) puis part au retour réseau', async ({
    page,
  }) => {
    test.skip(!!setupFailedReason, setupFailedReason ?? '');

    // Interception de l'ack : abort (coupure réseau) tant que blockAck=true.
    let blockAck = true;
    let abortCount = 0;
    await page.route(ACK_URL_RE, async (route) => {
      if (blockAck) {
        abortCount += 1;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    await loginAsCaster(page);
    await page.goto('/caster/cockpit');
    await page.waitForLoadState('networkidle');

    const modal = page.getByTestId('urgent-cue-modal');
    await expect(modal).toBeVisible({ timeout: 20_000 });

    const ackBtn = page.getByTestId('urgent-cue-ack');
    const feedAckBtn = page.getByTestId(`cue-ack-${cueId}`);

    // Le cue est bien listé NON-acké dans le CueFeed au départ.
    await expect(feedAckBtn).toBeVisible({ timeout: 10_000 });

    // --- Ack sous coupure réseau : le POST est tenté puis échoue -----------
    await Promise.all([
      page.waitForRequest(
        (r) => ACK_URL_RE.test(r.url()) && r.method() === 'POST'
      ),
      ackBtn.click(),
    ]);
    expect(abortCount).toBeGreaterThanOrEqual(1);

    // La modal reste ouverte (l'ack optimiste est rollback → cue non acké).
    await expect(modal).toBeVisible({ timeout: 10_000 });
    // Aucun faux ✓ : le cue reste NON-acké dans le CueFeed (bouton présent).
    await expect(feedAckBtn).toBeVisible();

    // --- Retour réseau : le nouvel ack part réellement --------------------
    const ackSucceeded = page.waitForResponse(
      (r) =>
        ACK_URL_RE.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 20_000 }
    );
    blockAck = false;
    await ackBtn.click();
    await ackSucceeded;

    // La modal se ferme (ack réel confirmé) et le CueFeed passe au ✓ : le
    // bouton d'ack du feed disparaît.
    await expect(modal).toHaveCount(0, { timeout: 10_000 });
    await expect(feedAckBtn).toHaveCount(0, { timeout: 10_000 });

    // Contrôle DB : event_cue_acks créé pour ce cue + ce caster.
    if (supabaseTestClient && cueId && castMemberId) {
      const { data: ackRow } = await supabaseTestClient
        .from('event_cue_acks')
        .select('cue_id, cast_member_id')
        .eq('cue_id', cueId)
        .eq('cast_member_id', castMemberId)
        .maybeSingle();
      expect(ackRow).toBeTruthy();
    }
  });

  // ---------------------------------------------------------------------------
  // FEATURE #8 — porte de sortie hors-ligne (ack différé).
  //
  // Le bug qui rendait ce chemin inatteignable est corrigé : useCueStream.ack()
  // ne fait plus de MàJ optimiste (qui démontait/remontait la UrgentCueModal à
  // chaque échec et réinitialisait failCount). L'état n'est modifié qu'au succès
  // → la modal reste stable pendant les retries, failCount s'accumule, et le
  // bouton « Vu (hors ligne) » (failCount >= 2) apparaît bien.
  // Non-régression : apparition du bouton après 2 échecs → fermeture locale sans
  // faux ack → envoi différé au retour réseau.
  // ---------------------------------------------------------------------------
  test('Porte de sortie « Vu (hors ligne) » après 2 échecs → fermeture sans faux ack → ack différé au retour réseau', async ({
    page,
  }) => {
    test.skip(!!setupFailedReason, setupFailedReason ?? '');

    let blockAck = true;
    let abortCount = 0;
    await page.route(ACK_URL_RE, async (route) => {
      if (blockAck) {
        abortCount += 1;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    await loginAsCaster(page);
    await page.goto('/caster/cockpit');
    await page.waitForLoadState('networkidle');

    const modal = page.getByTestId('urgent-cue-modal');
    await expect(modal).toBeVisible({ timeout: 20_000 });

    const ackBtn = page.getByTestId('urgent-cue-ack');
    const offlineBtn = page.getByTestId('urgent-cue-ack-offline');

    await expect(offlineBtn).toHaveCount(0);

    // 1er échec.
    await Promise.all([
      page.waitForRequest(
        (r) => ACK_URL_RE.test(r.url()) && r.method() === 'POST'
      ),
      ackBtn.click(),
    ]);
    await expect(ackBtn).toHaveText(/Réessayer/i, { timeout: 10_000 });
    await expect(offlineBtn).toHaveCount(0);

    // 2e échec → la porte de sortie hors-ligne apparaît.
    await Promise.all([
      page.waitForRequest(
        (r) => ACK_URL_RE.test(r.url()) && r.method() === 'POST'
      ),
      ackBtn.click(),
    ]);
    await expect(offlineBtn).toBeVisible({ timeout: 10_000 });
    expect(abortCount).toBeGreaterThanOrEqual(2);

    // « Vu (hors ligne) » : fermeture locale SANS faux ack.
    await offlineBtn.click();
    await expect(modal).toHaveCount(0, { timeout: 10_000 });

    const feedAckBtn = page.getByTestId(`cue-ack-${cueId}`);
    await expect(feedAckBtn).toBeVisible({ timeout: 10_000 });

    // Retour réseau : le retry en fond envoie l'ack réel.
    const ackSucceeded = page.waitForResponse(
      (r) =>
        ACK_URL_RE.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 20_000 }
    );
    blockAck = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await ackSucceeded;

    await expect(feedAckBtn).toHaveCount(0, { timeout: 10_000 });
    await expect(modal).toHaveCount(0);
  });
});
