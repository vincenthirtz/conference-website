// tests/e2e/stage-format-lock.spec.ts
// Couvre P0-A : verrou anti-modification du match_format dès qu'un match
// du stage a quitté pending/cancelled.
//   - PATCH /admin/stages/[id] settings.match_format : 409 STAGE_FORMAT_LOCKED
//   - PATCH /admin/matches/[id] match_format : 409 MATCH_FORMAT_LOCKED

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const STAFF_EMAIL = `hirtzvincent+e2e-format-lock-${TS}@gmail.com`;
const PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getToken(): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: STAFF_EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

test.describe.serial('Stage / match format lock (P0-A)', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  let token: string | null = null;
  let tournamentId: string | null = null;
  let stageId: string | null = null;
  let matchId: string | null = null;
  let team1Id: string | null = null;
  let team2Id: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await deleteTestStaff(STAFF_EMAIL);
    await createTestStaff(STAFF_EMAIL, PASSWORD, 'admin');
    token = await getToken();
    expect(token).toBeTruthy();

    const { data: tournament } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Format Lock ${TS}`,
        slug: `e2e-format-lock-${TS}`,
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
        settings: { match_format: 'bo3' },
      })
      .select('id')
      .single();
    stageId = stage!.id;

    const { data: teams } = await supabaseTestClient
      .from('teams')
      .insert([
        { name: `E2E FL A ${TS}`, slug: `e2e-fl-a-${TS}` },
        { name: `E2E FL B ${TS}`, slug: `e2e-fl-b-${TS}` },
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
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (matchId) await supabaseTestClient.from('matches').delete().eq('id', matchId);
    if (stageId)
      await supabaseTestClient.from('tournament_stages').delete().eq('id', stageId);
    if (tournamentId)
      await supabaseTestClient.from('tournaments').delete().eq('id', tournamentId);
    for (const tid of [team1Id, team2Id].filter(Boolean)) {
      await supabaseTestClient.from('teams').delete().eq('id', tid as string);
    }
    await deleteTestStaff(STAFF_EMAIL);
  });

  /* -------------------- stage settings.match_format -------------------- */

  test('PATCH stage settings.match_format autorisé tant que tous les matchs sont pending', async ({
    request,
  }) => {
    const res = await request.patch(`/api/admin/stages/${stageId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { settings: { match_format: 'bo5' } },
    });
    expect(res.status()).toBe(200);
    // Revert pour les tests suivants.
    await request.patch(`/api/admin/stages/${stageId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { settings: { match_format: 'bo3' } },
    });
  });

  test('PATCH stage settings.match_format → 409 dès qu un match passe ongoing', async ({
    request,
  }) => {
    await supabaseTestClient!
      .from('matches')
      .update({ status: 'ongoing' })
      .eq('id', matchId!);

    const res = await request.patch(`/api/admin/stages/${stageId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { settings: { match_format: 'bo5' } },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('STAGE_FORMAT_LOCKED');
    expect(body.lockedMatchCount).toBeGreaterThanOrEqual(1);
  });

  test('PATCH stage settings autres champs reste autorisé même si stage locked', async ({
    request,
  }) => {
    // On change advancement_rules sans toucher match_format → doit passer.
    const res = await request.patch(`/api/admin/stages/${stageId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { settings: { match_format: 'bo3', total_rounds: 5 } },
    });
    // match_format identique à before → garde inactive → 200 attendu
    expect(res.status()).toBe(200);
  });

  /* -------------------- match.match_format -------------------- */

  test('PATCH match.match_format → 409 si status != pending', async ({
    request,
  }) => {
    // Le match est déjà ongoing depuis le test précédent.
    const res = await request.patch(`/api/admin/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { match_format: 'bo5' },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('MATCH_FORMAT_LOCKED');
    expect(body.currentStatus).toBe('ongoing');
  });

  test('PATCH match.match_format autorisé si on repasse en pending', async ({
    request,
  }) => {
    await supabaseTestClient!
      .from('matches')
      .update({ status: 'pending' })
      .eq('id', matchId!);

    const res = await request.patch(`/api/admin/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { match_format: 'bo5' },
    });
    expect(res.status()).toBe(200);
  });
});
