import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';
import slugify from 'slugify';

const TS = Date.now();
const TOURNAMENT_NAME = `E2E Groups ${TS}`;

let tournamentId: string | null = null;
let stageId: string | null = null;
let team1Id: string | null = null;
let team2Id: string | null = null;
let team3Id: string | null = null;
let team4Id: string | null = null;

test.describe('Stage groups & pool management (direct supabase)', () => {
  test.skip(!supabaseTestClient, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Create tournament
    const slug = slugify(TOURNAMENT_NAME, { lower: true, strict: true });
    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({ name: TOURNAMENT_NAME, slug, status: 'running', game: 'Overwatch 2' })
      .select('id')
      .maybeSingle();
    tournamentId = t!.id;

    // Create group stage
    const { data: s } = await supabaseTestClient
      .from('stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Phase de poules',
        stage_type: 'group',
        order_index: 0,
        is_active: true,
        is_public: false,
        settings: { num_groups: 2 },
      })
      .select('id')
      .maybeSingle();
    stageId = s!.id;

    // Create 4 teams
    const teamNames = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((n) => `E2E ${n} ${TS}`);
    const teams: string[] = [];
    for (const name of teamNames) {
      const { data: tm } = await supabaseTestClient
        .from('teams')
        .insert({ name, tag: name.slice(0, 10) })
        .select('id')
        .maybeSingle();
      teams.push(tm!.id);
    }
    [team1Id, team2Id, team3Id, team4Id] = teams;

    // Enroll teams in stage
    const stageTeams = teams.map((tid, i) => ({
      stage_id: stageId,
      team_id: tid,
      seed: i + 1,
    }));
    await supabaseTestClient.from('stage_teams').insert(stageTeams);
  });

  test.afterAll(async () => {
    if (!supabaseTestClient || !tournamentId) return;
    await supabaseTestClient.from('matches').delete().eq('tournament_id', tournamentId);
    if (stageId) await supabaseTestClient.from('stage_teams').delete().eq('stage_id', stageId);
    await supabaseTestClient.from('stages').delete().eq('tournament_id', tournamentId);
    await supabaseTestClient.from('tournaments').delete().eq('id', tournamentId);
    for (const tid of [team1Id, team2Id, team3Id, team4Id]) {
      if (tid) await supabaseTestClient.from('teams').delete().eq('id', tid);
    }
  });

  test('Enregistrer des assignations de groupe dans settings', async () => {
    if (!supabaseTestClient || !stageId) return;

    const groupAssignments = {
      A: [team1Id!, team2Id!],
      B: [team3Id!, team4Id!],
    };

    const { error } = await supabaseTestClient
      .from('stages')
      .update({
        settings: { num_groups: 2, group_assignments: groupAssignments },
      })
      .eq('id', stageId);

    expect(error).toBeNull();

    const { data: stage } = await supabaseTestClient
      .from('stages')
      .select('settings')
      .eq('id', stageId)
      .maybeSingle();

    expect(stage!.settings.group_assignments).toBeDefined();
    expect(stage!.settings.group_assignments.A).toHaveLength(2);
    expect(stage!.settings.group_assignments.B).toHaveLength(2);
  });

  test('Créer des matchs avec group_key', async () => {
    if (!supabaseTestClient || !tournamentId || !stageId) return;

    const { data, error } = await supabaseTestClient
      .from('matches')
      .insert([
        {
          tournament_id: tournamentId,
          stage_id: stageId,
          team1_id: team1Id,
          team2_id: team2Id,
          round_number: 1,
          match_format: 'bo3',
          best_of: 3,
          status: 'pending',
          group_key: 'A',
        },
        {
          tournament_id: tournamentId,
          stage_id: stageId,
          team1_id: team3Id,
          team2_id: team4Id,
          round_number: 1,
          match_format: 'bo3',
          best_of: 3,
          status: 'pending',
          group_key: 'B',
        },
      ])
      .select('id, group_key');

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].group_key).toBe('A');
    expect(data![1].group_key).toBe('B');
  });

  test('Filtrer les matchs par group_key', async () => {
    if (!supabaseTestClient || !stageId) return;

    const { data: groupA } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('stage_id', stageId)
      .eq('group_key', 'A');

    expect(groupA!.length).toBe(1);

    const { data: groupB } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('stage_id', stageId)
      .eq('group_key', 'B');

    expect(groupB!.length).toBe(1);
  });

  test('Modifier le group_key d\'un match', async () => {
    if (!supabaseTestClient || !stageId) return;

    const { data: match } = await supabaseTestClient
      .from('matches')
      .select('id')
      .eq('stage_id', stageId)
      .eq('group_key', 'A')
      .maybeSingle();

    const { data: updated, error } = await supabaseTestClient
      .from('matches')
      .update({ group_key: 'C' })
      .eq('id', match!.id)
      .select('group_key')
      .maybeSingle();

    expect(error).toBeNull();
    expect(updated!.group_key).toBe('C');

    // Restore original
    await supabaseTestClient
      .from('matches')
      .update({ group_key: 'A' })
      .eq('id', match!.id);
  });

  test('stage_teams a les bons seeds', async () => {
    if (!supabaseTestClient || !stageId) return;

    const { data } = await supabaseTestClient
      .from('stage_teams')
      .select('team_id, seed')
      .eq('stage_id', stageId)
      .order('seed', { ascending: true });

    expect(data).toHaveLength(4);
    expect(data![0].seed).toBe(1);
    expect(data![0].team_id).toBe(team1Id);
    expect(data![3].seed).toBe(4);
    expect(data![3].team_id).toBe(team4Id);
  });
});
