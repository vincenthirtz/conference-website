// tests/e2e/manual-seed.spec.ts
// Couvre POST /api/admin/stages/[stageId]/manual-seed (P1-B).

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const STAFF_EMAIL = `hirtzvincent+e2e-manual-seed-${TS}@gmail.com`;
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

test.describe.serial('Manual seed (P1-B)', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  let token: string | null = null;
  let tournamentId: string | null = null;
  let stageId: string | null = null;
  let team1Id: string | null = null;
  let team2Id: string | null = null;
  let match1Id: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    await deleteTestStaff(STAFF_EMAIL);
    await createTestStaff(STAFF_EMAIL, PASSWORD, 'admin');
    token = await getToken();

    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Manual Seed ${TS}`,
        slug: `e2e-manual-seed-${TS}`,
        status: 'draft',
      })
      .select('id')
      .single();
    tournamentId = t!.id;

    const { data: s } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Bracket E2E',
        stage_type: 'bracket',
        order_index: 1,
      })
      .select('id')
      .single();
    stageId = s!.id;

    const { data: teams } = await supabaseTestClient
      .from('teams')
      .insert([
        { name: `Manual Seed A ${TS}`, slug: `ms-a-${TS}` },
        { name: `Manual Seed B ${TS}`, slug: `ms-b-${TS}` },
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
        match_format: 'bo3',
      })
      .select('id')
      .single();
    match1Id = m!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (match1Id)
      await supabaseTestClient.from('matches').delete().eq('id', match1Id);
    if (stageId) {
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

  test('POST manual-seed assigne team1 + team2 sur le match', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/admin/stages/${stageId}/manual-seed`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          assignments: [
            { matchId: match1Id, slot: 1, teamId: team1Id, seed: 1 },
            { matchId: match1Id, slot: 2, teamId: team2Id, seed: 2 },
          ],
        },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.seeded).toHaveLength(2);
    expect(body.totalMatches).toBe(1);

    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('team1_id, team2_id')
      .eq('id', match1Id!)
      .single();
    expect(m!.team1_id).toBe(team1Id);
    expect(m!.team2_id).toBe(team2Id);
  });

  test('slot déjà rempli → 409 SLOT_CONFLICT sans replaceExisting', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/admin/stages/${stageId}/manual-seed`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          assignments: [
            // Réassigner slot 1 à team2 (déjà team1)
            { matchId: match1Id, slot: 1, teamId: team2Id },
          ],
        },
      }
    );
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('SLOT_CONFLICT');
  });

  test('replaceExisting=true autorise l\'écrasement', async ({ request }) => {
    const res = await request.post(
      `/api/admin/stages/${stageId}/manual-seed`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          replaceExisting: true,
          assignments: [
            { matchId: match1Id, slot: 1, teamId: team2Id },
            { matchId: match1Id, slot: 2, teamId: team1Id },
          ],
        },
      }
    );
    expect(res.status()).toBe(200);
  });

  test('teamId dupliqué dans assignments → 400', async ({ request }) => {
    const res = await request.post(
      `/api/admin/stages/${stageId}/manual-seed`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          assignments: [
            { matchId: match1Id, slot: 1, teamId: team1Id },
            { matchId: match1Id, slot: 2, teamId: team1Id }, // dup
          ],
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('matchId hors round 1 → 400', async ({ request }) => {
    // Crée un match round 2 et tente de l'utiliser.
    const { data: m2 } = await supabaseTestClient!
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'pending',
        round_number: 2,
      })
      .select('id')
      .single();
    try {
      const res = await request.post(
        `/api/admin/stages/${stageId}/manual-seed`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            replaceExisting: true,
            assignments: [{ matchId: m2!.id, slot: 1, teamId: team1Id }],
          },
        }
      );
      expect(res.status()).toBe(400);
    } finally {
      await supabaseTestClient!.from('matches').delete().eq('id', m2!.id);
    }
  });
});
