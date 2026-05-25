import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';
import slugify from 'slugify';

const TS = Date.now();
const TOURNAMENT_NAME = `E2E Completion ${TS}`;

let tournamentId: string | null = null;
let stage1Id: string | null = null;
let stage2Id: string | null = null;
let team1Id: string | null = null;
let team2Id: string | null = null;

test.describe('Stage completion & swiss rounds (direct supabase)', () => {
  test.skip(!supabaseTestClient, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const slug = slugify(TOURNAMENT_NAME, { lower: true, strict: true });
    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: TOURNAMENT_NAME,
        slug,
        status: 'running',
        game: 'overwatch',
      })
      .select('id')
      .maybeSingle();
    tournamentId = t!.id;

    // Stage 1 - swiss
    const { data: s1 } = await supabaseTestClient
      .from('stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Swiss Phase',
        stage_type: 'swiss',
        order_index: 0,
        is_active: true,
        is_public: false,
        settings: { total_rounds: 3, win_points: 3 },
      })
      .select('id')
      .maybeSingle();
    stage1Id = s1!.id;

    // Stage 2 - bracket (next stage)
    const { data: s2 } = await supabaseTestClient
      .from('stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Bracket Phase',
        stage_type: 'bracket',
        order_index: 1,
        is_active: false,
        is_public: false,
      })
      .select('id')
      .maybeSingle();
    stage2Id = s2!.id;

    // Create teams
    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Comp A ${TS}`, tag: `CA${TS}` })
      .select('id')
      .maybeSingle();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Comp B ${TS}`, tag: `CB${TS}` })
      .select('id')
      .maybeSingle();
    team2Id = t2!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient || !tournamentId) return;
    await supabaseTestClient
      .from('matches')
      .delete()
      .eq('tournament_id', tournamentId);
    await supabaseTestClient
      .from('stages')
      .delete()
      .eq('tournament_id', tournamentId);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    for (const tid of [team1Id, team2Id]) {
      if (tid) await supabaseTestClient.from('teams').delete().eq('id', tid);
    }
  });

  test('Stage sans matchs: pas de completion', async () => {
    if (!supabaseTestClient || !stage1Id) return;

    const { data: matches } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('stage_id', stage1Id);

    expect(matches).toHaveLength(0);
  });

  test('Créer des matchs swiss round 1', async () => {
    if (!supabaseTestClient || !tournamentId || !stage1Id) return;

    const { data, error } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stage1Id,
        team1_id: team1Id,
        team2_id: team2Id,
        round_number: 1,
        match_format: 'bo3',
        best_of: 3,
        status: 'pending',
      })
      .select('id, round_number, status')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data!.round_number).toBe(1);
    expect(data!.status).toBe('pending');
  });

  test('Round en cours: matchs pending ne bloquent pas la query', async () => {
    if (!supabaseTestClient || !stage1Id) return;

    const { data: matches } = await supabaseTestClient
      .from('matches')
      .select('id, status, round_number')
      .eq('stage_id', stage1Id)
      .neq('status', 'cancelled');

    expect(matches!.length).toBeGreaterThan(0);

    const currentRound = Math.max(
      ...matches!.map((m: any) => m.round_number ?? 0)
    );
    expect(currentRound).toBe(1);

    const currentRoundMatches = matches!.filter(
      (m: any) => m.round_number === currentRound
    );
    const allFinished = currentRoundMatches.every(
      (m: any) => m.status === 'finished'
    );
    expect(allFinished).toBe(false);
  });

  test('Terminer le round 1 et vérifier', async () => {
    if (!supabaseTestClient || !stage1Id) return;

    // Finish all round 1 matches
    const { error } = await supabaseTestClient
      .from('matches')
      .update({
        status: 'finished',
        team1_score: 2,
        team2_score: 0,
        winner_team_id: team1Id,
      })
      .eq('stage_id', stage1Id)
      .eq('round_number', 1);

    expect(error).toBeNull();

    // Verify all round 1 matches finished
    const { data: matches } = await supabaseTestClient
      .from('matches')
      .select('id, status')
      .eq('stage_id', stage1Id)
      .eq('round_number', 1);

    const allFinished = matches!.every((m: any) => m.status === 'finished');
    expect(allFinished).toBe(true);
  });

  test('Stages ordonnées par order_index', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: stages } = await supabaseTestClient
      .from('stages')
      .select('id, name, order_index, stage_type')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    expect(stages).toHaveLength(2);
    expect(stages![0].name).toBe('Swiss Phase');
    expect(stages![0].order_index).toBe(0);
    expect(stages![1].name).toBe('Bracket Phase');
    expect(stages![1].order_index).toBe(1);
  });

  test('Trouver la stage suivante par order_index', async () => {
    if (!supabaseTestClient || !tournamentId || !stage1Id) return;

    // Get current stage
    const { data: current } = await supabaseTestClient
      .from('stages')
      .select('id, order_index')
      .eq('id', stage1Id)
      .maybeSingle();

    // Find next stage
    const { data: next } = await supabaseTestClient
      .from('stages')
      .select('id, name, stage_type')
      .eq('tournament_id', tournamentId)
      .gt('order_index', current!.order_index)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    expect(next).not.toBeNull();
    expect(next!.id).toBe(stage2Id);
    expect(next!.name).toBe('Bracket Phase');
    expect(next!.stage_type).toBe('bracket');
  });

  test('Stage swiss settings stockent total_rounds', async () => {
    if (!supabaseTestClient || !stage1Id) return;

    const { data: stage } = await supabaseTestClient
      .from('stages')
      .select('settings')
      .eq('id', stage1Id)
      .maybeSingle();

    expect(stage!.settings.total_rounds).toBe(3);
    expect(stage!.settings.win_points).toBe(3);
  });

  test('Matchs cancelled sont exclus du comptage', async () => {
    if (!supabaseTestClient || !tournamentId || !stage1Id) return;

    // Insert a cancelled match
    await supabaseTestClient.from('matches').insert({
      tournament_id: tournamentId,
      stage_id: stage1Id,
      team1_id: team1Id,
      team2_id: team2Id,
      round_number: 1,
      match_format: 'bo3',
      best_of: 3,
      status: 'cancelled',
    });

    // Query excluding cancelled
    const { data: active } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('stage_id', stage1Id)
      .neq('status', 'cancelled');

    const { data: all } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('stage_id', stage1Id);

    expect(all!.length).toBeGreaterThan(active!.length);
  });
});
