import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';
import slugify from 'slugify';

const TS = Date.now();
const TOURNAMENT_NAME = `E2E Matches ${TS}`;

let tournamentId: string | null = null;
let stageId: string | null = null;
let team1Id: string | null = null;
let team2Id: string | null = null;

test.describe('Tournament matches CRUD (direct supabase)', () => {
  test.skip(!supabaseTestClient, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Create tournament
    const slug = slugify(TOURNAMENT_NAME, { lower: true, strict: true });
    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: TOURNAMENT_NAME,
        slug,
        status: 'running',
        game: 'Overwatch',
      })
      .select('id')
      .maybeSingle();
    tournamentId = t!.id;

    // Create stage
    const { data: s } = await supabaseTestClient
      .from('stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Bracket',
        stage_type: 'bracket',
        order_index: 0,
        is_active: true,
        is_public: true,
      })
      .select('id')
      .maybeSingle();
    stageId = s!.id;

    // Create two teams
    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Team A ${TS}`, tag: `TA${TS}` })
      .select('id')
      .maybeSingle();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Team B ${TS}`, tag: `TB${TS}` })
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
    if (team1Id)
      await supabaseTestClient.from('teams').delete().eq('id', team1Id);
    if (team2Id)
      await supabaseTestClient.from('teams').delete().eq('id', team2Id);
  });

  test('Créer un match BO3', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data, error } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        team1_id: team1Id,
        team2_id: team2Id,
        round_number: 1,
        match_format: 'bo3',
        best_of: 3,
        status: 'pending',
        bracket_side: 'wb',
      })
      .select('*')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.match_format).toBe('bo3');
    expect(data!.best_of).toBe(3);
    expect(data!.status).toBe('pending');
    expect(data!.team1_id).toBe(team1Id);
    expect(data!.team2_id).toBe(team2Id);
  });

  test('Créer un match BO5', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data, error } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        team1_id: team1Id,
        team2_id: team2Id,
        round_number: 2,
        match_format: 'bo5',
        best_of: 5,
        status: 'pending',
        round_name: 'Finale',
      })
      .select('*')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data!.match_format).toBe('bo5');
    expect(data!.best_of).toBe(5);
    expect(data!.round_name).toBe('Finale');
  });

  test("Mettre à jour le score d'un match", async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: match } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('round_number', 1)
      .maybeSingle();

    const { data: updated, error } = await supabaseTestClient
      .from('matches')
      .update({
        team1_score: 2,
        team2_score: 1,
        winner_team_id: team1Id,
        status: 'finished',
      })
      .eq('id', match!.id)
      .select('team1_score, team2_score, winner_team_id, status')
      .maybeSingle();

    expect(error).toBeNull();
    expect(updated!.team1_score).toBe(2);
    expect(updated!.team2_score).toBe(1);
    expect(updated!.winner_team_id).toBe(team1Id);
    expect(updated!.status).toBe('finished');
  });

  test('Lister les matchs par statut', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: finished } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'finished');

    expect(finished!.length).toBe(1);

    const { data: pending } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'pending');

    expect(pending!.length).toBe(1);
  });

  test('Programmer un match (scheduled_at)', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: match } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'pending')
      .maybeSingle();

    const scheduledTime = new Date('2026-04-01T15:00:00Z').toISOString();

    const { data: updated, error } = await supabaseTestClient
      .from('matches')
      .update({ scheduled_at: scheduledTime })
      .eq('id', match!.id)
      .select('scheduled_at')
      .maybeSingle();

    expect(error).toBeNull();
    expect(updated!.scheduled_at).toBeTruthy();
  });

  test('Annuler un match', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: match } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'pending')
      .maybeSingle();

    const { data: updated, error } = await supabaseTestClient
      .from('matches')
      .update({ status: 'cancelled' })
      .eq('id', match!.id)
      .select('status')
      .maybeSingle();

    expect(error).toBeNull();
    expect(updated!.status).toBe('cancelled');
  });

  test('Match sans équipes (TBD)', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data, error } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        team1_id: null,
        team2_id: null,
        round_number: 3,
        match_format: 'bo3',
        best_of: 3,
        status: 'pending',
      })
      .select('team1_id, team2_id')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data!.team1_id).toBeNull();
    expect(data!.team2_id).toBeNull();
  });
});
