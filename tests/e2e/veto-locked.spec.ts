// tests/e2e/veto-locked.spec.ts
// Couvre le flow P0 "veto_locked_at" :
//   - garde 409 VETO_LOCKED sur POST/DELETE quand le match a démarré
//   - PATCH /veto { unlock: true } réservé aux admin+
//   - UI : bandeau "Veto verrouillé" visible + bouton "Déverrouiller" conditionné au rôle
//
// Stratégie :
//   - On seed un tournoi+stage+2 teams+1 match côté beforeAll.
//   - On flip `veto_locked_at` directement en DB (au lieu de passer par
//     /admin/matches/[id] PATCH status=ongoing) pour isoler le seul effet
//     qu'on teste : la garde sur l'endpoint /veto.
//   - On wipe match_map_vetos entre les groupes pour rester déterministe.

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const ADMIN_EMAIL = `hirtzvincent+e2e-veto-locked-admin-${TS}@gmail.com`;
const MANAGER_EMAIL = `e2e-veto-locked-mgr-${TS}@test.local`;
const PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getTokenFor(email: string): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

async function loginAsUI(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('input#email', email);
  await page.fill('input#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

async function setVetoLocked(matchId: string, lockedAt: string | null) {
  await supabaseTestClient!
    .from('matches')
    .update({ veto_locked_at: lockedAt })
    .eq('id', matchId);
}

async function wipeVetoSteps(matchId: string) {
  await supabaseTestClient!
    .from('match_map_vetos')
    .delete()
    .eq('match_id', matchId);
}

test.describe.serial('Veto locked flow (P0 matches)', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  let adminToken: string | null = null;
  let managerToken: string | null = null;
  let tournamentId: string | null = null;
  let stageId: string | null = null;
  let team1Id: string | null = null;
  let team2Id: string | null = null;
  let matchId: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Nettoyage préventif (run précédent KO).
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestStaff(MANAGER_EMAIL);

    await createTestStaff(ADMIN_EMAIL, PASSWORD, 'admin');
    await createTestStaff(MANAGER_EMAIL, PASSWORD, 'manager');

    adminToken = await getTokenFor(ADMIN_EMAIL);
    managerToken = await getTokenFor(MANAGER_EMAIL);
    expect(adminToken, 'admin token must be obtained').toBeTruthy();
    expect(managerToken, 'manager token must be obtained').toBeTruthy();

    // Seed tournoi draft + stage.
    const { data: tournament } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Veto Locked ${TS}`,
        slug: `e2e-veto-locked-${TS}`,
        status: 'draft',
      })
      .select('id')
      .single();
    tournamentId = tournament!.id;

    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Stage E2E',
        kind: 'single_elimination',
        position: 1,
      })
      .select('id')
      .single();
    stageId = stage!.id;

    const { data: teams } = await supabaseTestClient
      .from('teams')
      .insert([
        { name: `E2E VL Team A ${TS}`, slug: `e2e-vl-team-a-${TS}` },
        { name: `E2E VL Team B ${TS}`, slug: `e2e-vl-team-b-${TS}` },
      ])
      .select('id');
    team1Id = teams![0].id;
    team2Id = teams![1].id;

    const { data: match } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'pending',
        round_number: 1,
        team1_id: team1Id,
        team2_id: team2Id,
        match_format: 'bo3',
      })
      .select('id')
      .single();
    matchId = match!.id;

    // État initial : veto unlocked.
    await setVetoLocked(matchId!, null);
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;

    if (matchId) {
      await supabaseTestClient
        .from('match_map_vetos')
        .delete()
        .eq('match_id', matchId);
      await supabaseTestClient.from('matches').delete().eq('id', matchId);
    }
    if (stageId) {
      await supabaseTestClient
        .from('tournament_stages')
        .delete()
        .eq('id', stageId);
    }
    if (tournamentId) {
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    }
    for (const tid of [team1Id, team2Id].filter(Boolean)) {
      await supabaseTestClient
        .from('teams')
        .delete()
        .eq('id', tid as string);
    }
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestStaff(MANAGER_EMAIL);
  });

  /* -------------------------------- API: garde 409 -------------------------------- */

  test('API · manager peut POST veto step quand match unlocked', async ({
    request,
  }) => {
    await wipeVetoSteps(matchId!);
    await setVetoLocked(matchId!, null);

    const res = await request.post(`/api/admin/matches/${matchId}/veto`, {
      headers: { Authorization: `Bearer ${managerToken}` },
      data: {
        action: 'ban',
        team_id: team1Id,
        map_name: 'Busan',
        map_type: 'control',
      },
    });
    expect(res.status()).toBe(201);
  });

  test('API · POST veto step sur match locké → 409 VETO_LOCKED', async ({
    request,
  }) => {
    await setVetoLocked(matchId!, new Date().toISOString());

    const res = await request.post(`/api/admin/matches/${matchId}/veto`, {
      headers: { Authorization: `Bearer ${managerToken}` },
      data: {
        action: 'ban',
        team_id: team2Id,
        map_name: 'Ilios',
        map_type: 'control',
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('VETO_LOCKED');
    expect(body.vetoLockedAt).toBeTruthy();
  });

  test('API · DELETE veto sur match locké → 409 VETO_LOCKED', async ({
    request,
  }) => {
    // Toujours locked depuis le test précédent.
    const res = await request.delete(`/api/admin/matches/${matchId}/veto`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('VETO_LOCKED');
  });

  test('API · GET veto expose vetoLockedAt', async ({ request }) => {
    const res = await request.get(`/api/admin/matches/${matchId}/veto`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.vetoLockedAt).toBeTruthy();
  });

  /* -------------------------------- API: unlock RBAC -------------------------------- */

  test('API · PATCH unlock par manager → 403', async ({ request }) => {
    const res = await request.patch(`/api/admin/matches/${matchId}/veto`, {
      headers: { Authorization: `Bearer ${managerToken}` },
      data: { unlock: true },
    });
    expect(res.status()).toBe(403);
  });

  test('API · PATCH unlock par admin → 200 + DB null', async ({ request }) => {
    const res = await request.patch(`/api/admin/matches/${matchId}/veto`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { unlock: true, reason: 'e2e test unlock' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.vetoLockedAt).toBeNull();

    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('veto_locked_at')
      .eq('id', matchId!)
      .single();
    expect(m!.veto_locked_at).toBeNull();
  });

  test('API · après unlock, POST veto step → 201', async ({ request }) => {
    const res = await request.post(`/api/admin/matches/${matchId}/veto`, {
      headers: { Authorization: `Bearer ${managerToken}` },
      data: {
        action: 'ban',
        team_id: team2Id,
        map_name: 'Nepal',
        map_type: 'control',
      },
    });
    expect(res.status()).toBe(201);
  });

  /* -------------------------------- UI: bandeau & RBAC -------------------------------- */

  test('UI · manager voit bandeau verrouillé sans bouton Déverrouiller', async ({
    page,
  }) => {
    await wipeVetoSteps(matchId!);
    await setVetoLocked(matchId!, new Date().toISOString());

    await loginAsUI(page, MANAGER_EMAIL);
    await page.goto(`/admin/tournament/${tournamentId}/bracket?tab=veto`);

    // Sélectionne le match dans le dropdown.
    const select = page.locator('select').first();
    await select.waitFor({ state: 'visible', timeout: 10000 });
    await select.selectOption({ value: matchId! });

    // Bandeau visible.
    await expect(page.getByText('Veto verrouillé')).toBeVisible({
      timeout: 5000,
    });
    // Bouton "Déverrouiller" absent pour un manager.
    await expect(
      page.getByRole('button', { name: 'Déverrouiller' })
    ).toHaveCount(0);
  });

  test('UI · admin voit bandeau + bouton Déverrouiller activé', async ({
    page,
  }) => {
    // Garde locked depuis le test précédent.
    await loginAsUI(page, ADMIN_EMAIL);
    await page.goto(`/admin/tournament/${tournamentId}/bracket?tab=veto`);

    const select = page.locator('select').first();
    await select.waitFor({ state: 'visible', timeout: 10000 });
    await select.selectOption({ value: matchId! });

    await expect(page.getByText('Veto verrouillé')).toBeVisible({
      timeout: 5000,
    });
    const unlockBtn = page.getByRole('button', { name: 'Déverrouiller' });
    await expect(unlockBtn).toBeVisible();
    await expect(unlockBtn).toBeEnabled();
  });
});
