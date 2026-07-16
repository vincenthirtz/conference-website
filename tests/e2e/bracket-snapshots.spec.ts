// tests/e2e/bracket-snapshots.spec.ts
// Couvre P2-C wiring : endpoint /admin/stages/[id]/snapshots
//   - GET liste
//   - POST création manuelle
//   - PATCH restore (admin only, manager → 403)
//   - Restore re-applique l'état des matches snapshotés
//
// Le hook automatique dans applyMatchScore/auto-seed/advance est testé
// indirectement : une fois ces routes appelées, un snapshot doit exister.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const MGR_EMAIL = `e2e-bs-mgr-${TS}@test.local`;
const ADMIN_EMAIL = `hirtzvincent+e2e-bs-admin-${TS}@gmail.com`;
const PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getToken(email: string): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const c = createClient(supabaseUrl, supabaseAnonKey);
  const { data } = await c.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  return data.session?.access_token ?? null;
}

test.describe.serial('Bracket snapshots (P2-C)', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  let mgrToken: string | null = null;
  let adminToken: string | null = null;
  let tournamentId: string | null = null;
  let stageId: string | null = null;
  let team1Id: string | null = null;
  let team2Id: string | null = null;
  let matchId: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    await deleteTestStaff(MGR_EMAIL);
    await deleteTestStaff(ADMIN_EMAIL);

    await createTestStaff(MGR_EMAIL, PASSWORD, 'admin');
    await createTestStaff(ADMIN_EMAIL, PASSWORD, 'admin');
    mgrToken = await getToken(MGR_EMAIL);
    adminToken = await getToken(ADMIN_EMAIL);

    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E BS ${TS}`,
        slug: `e2e-bs-${TS}`,
        status: 'draft',
      })
      .select('id')
      .single();
    tournamentId = t!.id;

    const { data: s } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'BS Stage',
        stage_type: 'bracket',
        order_index: 1,
      })
      .select('id')
      .single();
    stageId = s!.id;

    const { data: teams } = await supabaseTestClient
      .from('teams')
      .insert([
        { name: `BS A ${TS}`, slug: `bs-a-${TS}` },
        { name: `BS B ${TS}`, slug: `bs-b-${TS}` },
      ])
      .select('id');
    team1Id = teams![0].id;
    team2Id = teams![1].id;

    const { data: m } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'pending',
        round_number: 1,
        team1_id: team1Id,
        team2_id: team2Id,
        team1_score: 0,
        team2_score: 0,
      })
      .select('id')
      .single();
    matchId = m!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (stageId) {
      await supabaseTestClient
        .from('bracket_snapshots')
        .delete()
        .eq('stage_id', stageId);
    }
    if (matchId)
      await supabaseTestClient.from('matches').delete().eq('id', matchId);
    if (stageId)
      await supabaseTestClient
        .from('tournament_stages')
        .delete()
        .eq('id', stageId);
    if (tournamentId)
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    for (const tid of [team1Id, team2Id].filter(Boolean)) {
      await supabaseTestClient.from('teams').delete().eq('id', tid as string);
    }
    await deleteTestStaff(MGR_EMAIL);
    await deleteTestStaff(ADMIN_EMAIL);
  });

  test('POST manager crée un snapshot manuel', async ({ request }) => {
    const res = await request.post(
      `/api/admin/stages/${stageId}/snapshots`,
      {
        headers: { Authorization: `Bearer ${mgrToken}` },
        data: { reason: 'pre-test' },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.snapshotId).toBeGreaterThan(0);
    expect(body.matchCount).toBeGreaterThanOrEqual(1);
  });

  test('GET liste les snapshots du stage', async ({ request }) => {
    const res = await request.get(
      `/api/admin/stages/${stageId}/snapshots`,
      { headers: { Authorization: `Bearer ${mgrToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(body.snapshots[0].reason).toBeTruthy();
  });

  test('PATCH restore par manager → 403', async ({ request }) => {
    const { data } = await supabaseTestClient!
      .from('bracket_snapshots')
      .select('id')
      .eq('stage_id', stageId!)
      .limit(1);
    const id = data![0].id;

    const res = await request.patch(
      `/api/admin/stages/${stageId}/snapshots`,
      {
        headers: { Authorization: `Bearer ${mgrToken}` },
        data: { snapshotId: id },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('PATCH restore par admin restaure l\'état du match', async ({
    request,
  }) => {
    // 1) Mute le match → status finished + scores
    await supabaseTestClient!
      .from('matches')
      .update({
        status: 'finished',
        team1_score: 3,
        team2_score: 1,
        winner_team_id: team1Id,
      })
      .eq('id', matchId!);

    // 2) Récupère le snapshot le plus vieux (état pending 0-0)
    const { data: snaps } = await supabaseTestClient!
      .from('bracket_snapshots')
      .select('id')
      .eq('stage_id', stageId!)
      .order('taken_at', { ascending: true })
      .limit(1);
    const oldestId = snaps![0].id;

    const res = await request.patch(
      `/api/admin/stages/${stageId}/snapshots`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { snapshotId: oldestId },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.restored).toBeGreaterThanOrEqual(1);

    // 3) Vérifie que le match est revenu à pending 0-0
    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('status, team1_score, team2_score, winner_team_id')
      .eq('id', matchId!)
      .single();
    expect(m!.status).toBe('pending');
    expect(m!.team1_score).toBe(0);
    expect(m!.team2_score).toBe(0);
    expect(m!.winner_team_id).toBeNull();
  });
});
