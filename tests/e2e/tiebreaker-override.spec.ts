// tests/e2e/tiebreaker-override.spec.ts
// Couvre CRUD + wiring de stage_tiebreaker_overrides (P1-B).

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const STAFF_EMAIL = `hirtzvincent+e2e-tiebreak-${TS}@gmail.com`;
const PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getToken(): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const c = createClient(supabaseUrl, supabaseAnonKey);
  const { data } = await c.auth.signInWithPassword({
    email: STAFF_EMAIL,
    password: PASSWORD,
  });
  return data.session?.access_token ?? null;
}

test.describe.serial('Tiebreaker override (P1-B)', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  let token: string | null = null;
  let tournamentId: string | null = null;
  let stageId: string | null = null;
  let team1Id: string | null = null;
  let team2Id: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    await deleteTestStaff(STAFF_EMAIL);
    await createTestStaff(STAFF_EMAIL, PASSWORD, 'manager');
    token = await getToken();

    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Tiebreak ${TS}`,
        slug: `e2e-tiebreak-${TS}`,
        status: 'draft',
      })
      .select('id')
      .single();
    tournamentId = t!.id;

    const { data: s } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Group E2E',
        stage_type: 'group',
        order_index: 1,
      })
      .select('id')
      .single();
    stageId = s!.id;

    const { data: teams } = await supabaseTestClient
      .from('teams')
      .insert([
        { name: `TB A ${TS}`, slug: `tb-a-${TS}` },
        { name: `TB B ${TS}`, slug: `tb-b-${TS}` },
      ])
      .select('id');
    team1Id = teams![0].id;
    team2Id = teams![1].id;

    // Inscrit les 2 teams au stage
    await supabaseTestClient.from('stage_teams').insert([
      { stage_id: stageId, team_id: team1Id, seed: 1 },
      { stage_id: stageId, team_id: team2Id, seed: 2 },
    ]);
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (stageId) {
      await supabaseTestClient
        .from('stage_tiebreaker_overrides')
        .delete()
        .eq('stage_id', stageId);
      await supabaseTestClient
        .from('stage_teams')
        .delete()
        .eq('stage_id', stageId);
      await supabaseTestClient
        .from('tournament_stages')
        .delete()
        .eq('id', stageId);
    }
    if (tournamentId)
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    for (const tid of [team1Id, team2Id].filter(Boolean)) {
      await supabaseTestClient.from('teams').delete().eq('id', tid as string);
    }
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('POST crée un override', async ({ request }) => {
    const res = await request.post(
      `/api/admin/stages/${stageId}/tiebreaker-override`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          winnerTeamId: team2Id,
          loserTeamId: team1Id,
          reason: 'Finale jouée hors-tournoi',
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.override.winner_team_id).toBe(team2Id);
    expect(body.override.loser_team_id).toBe(team1Id);
  });

  test('POST avec winner=loser → 400', async ({ request }) => {
    const res = await request.post(
      `/api/admin/stages/${stageId}/tiebreaker-override`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { winnerTeamId: team1Id, loserTeamId: team1Id },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('POST en doublon → 409 OVERRIDE_EXISTS', async ({ request }) => {
    const res = await request.post(
      `/api/admin/stages/${stageId}/tiebreaker-override`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { winnerTeamId: team2Id, loserTeamId: team1Id },
      }
    );
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('OVERRIDE_EXISTS');
  });

  test('GET liste les overrides', async ({ request }) => {
    const res = await request.get(
      `/api/admin/stages/${stageId}/tiebreaker-override`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.overrides.length).toBeGreaterThanOrEqual(1);
  });

  test('DELETE retire l\'override', async ({ request }) => {
    const { data: list } = await supabaseTestClient!
      .from('stage_tiebreaker_overrides')
      .select('id')
      .eq('stage_id', stageId!);
    const id = list![0].id;

    const res = await request.delete(
      `/api/admin/stages/${stageId}/tiebreaker-override`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { id },
      }
    );
    expect(res.status()).toBe(200);

    const { data: after } = await supabaseTestClient!
      .from('stage_tiebreaker_overrides')
      .select('id')
      .eq('id', id);
    expect(after).toHaveLength(0);
  });

  test('équipe hors stage → 400', async ({ request }) => {
    // Crée une 3e team NON inscrite au stage
    const { data: t3 } = await supabaseTestClient!
      .from('teams')
      .insert({ name: `TB Outsider ${TS}`, slug: `tb-out-${TS}` })
      .select('id')
      .single();
    try {
      const res = await request.post(
        `/api/admin/stages/${stageId}/tiebreaker-override`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { winnerTeamId: team1Id, loserTeamId: t3!.id },
        }
      );
      expect(res.status()).toBe(400);
    } finally {
      await supabaseTestClient!.from('teams').delete().eq('id', t3!.id);
    }
  });
});
