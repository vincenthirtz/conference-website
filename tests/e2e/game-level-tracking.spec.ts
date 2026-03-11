import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';
import slugify from 'slugify';

const TS = Date.now();
const TOURNAMENT_NAME = `E2E GameTracking ${TS}`;

let tournamentId: string | null = null;
let team1Id: string | null = null;
let team2Id: string | null = null;
let matchId: string | null = null;

/* --------------------------------------------------------
 * Setup: tournament, stage, 2 teams, 1 match BO3, map pool
 * -------------------------------------------------------*/

test.describe('Game-level tracking & map stats', () => {
  test.skip(!supabaseTestClient, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const slug = slugify(TOURNAMENT_NAME, { lower: true, strict: true });
    const { data: t, error: tErr } = await supabaseTestClient
      .from('tournaments')
      .insert({ name: TOURNAMENT_NAME, slug, status: 'running', game: 'Overwatch' })
      .select('id')
      .maybeSingle();
    if (tErr) throw new Error(`Tournament insert failed: ${tErr.message}`);
    tournamentId = t!.id;

    const { data: t1, error: t1Err } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E GLT-A ${TS}`, short_name: `GA${TS}` })
      .select('id')
      .maybeSingle();
    if (t1Err) throw new Error(`Team1 insert failed: ${t1Err.message}`);
    team1Id = t1!.id;

    const { data: t2, error: t2Err } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E GLT-B ${TS}`, short_name: `GB${TS}` })
      .select('id')
      .maybeSingle();
    if (t2Err) throw new Error(`Team2 insert failed: ${t2Err.message}`);
    team2Id = t2!.id;

    // Create a BO3 match (stage_id null — stages table may not exist in test DB)
    const { data: m, error: mErr } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        round_number: 1,
        match_format: 'bo3',
        status: 'ongoing',
      })
      .select('id')
      .maybeSingle();
    if (mErr) throw new Error(`Match insert failed: ${mErr.message}`);
    matchId = m!.id;

    // Create map pool (7 maps for BO3 veto)
    const maps = [
      'Busan', 'Ilios', "King's Row", 'Dorado',
      'Colosseo', 'Nepal', 'Route 66',
    ];
    await supabaseTestClient.from('tournament_maps').insert(
      maps.map((name, i) => ({
        tournament_id: tournamentId,
        map_name: name,
        map_type: 'mixed',
        enabled: true,
        order_index: i,
      }))
    );
  });

  test.afterAll(async () => {
    if (!supabaseTestClient || !tournamentId) return;
    // Clean up in dependency order
    if (matchId) {
      await supabaseTestClient.from('games').delete().eq('match_id', matchId);
      await supabaseTestClient.from('match_map_vetos').delete().eq('match_id', matchId);
    }
    await supabaseTestClient.from('matches').delete().eq('tournament_id', tournamentId);
    await supabaseTestClient.from('tournament_maps').delete().eq('tournament_id', tournamentId);
    await supabaseTestClient.from('tournaments').delete().eq('id', tournamentId);
    if (team1Id) await supabaseTestClient.from('teams').delete().eq('id', team1Id);
    if (team2Id) await supabaseTestClient.from('teams').delete().eq('id', team2Id);
  });

  /* -------------------------------------------------------
   * 1) Games CRUD with winner_team_id & duration_minutes
   * ------------------------------------------------------*/

  test('Créer une game avec winner_team_id et duration_minutes', async () => {
    if (!supabaseTestClient || !matchId) return;

    const { data, error } = await supabaseTestClient
      .from('games')
      .insert({
        match_id: matchId,
        map_name: 'Busan',
        map_order: 0,
        team1_score: 2,
        team2_score: 0,
        winner_team_id: team1Id,
        duration_minutes: 18,
        is_tiebreaker: false,
        went_overtime: false,
      })
      .select('*')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.winner_team_id).toBe(team1Id);
    expect(data!.duration_minutes).toBe(18);
    expect(data!.map_name).toBe('Busan');
  });

  test('Créer une game sans winner_team_id (null par défaut)', async () => {
    if (!supabaseTestClient || !matchId) return;

    const { data, error } = await supabaseTestClient
      .from('games')
      .insert({
        match_id: matchId,
        map_name: "King's Row",
        map_order: 1,
        team1_score: 1,
        team2_score: 3,
        is_tiebreaker: false,
        went_overtime: false,
      })
      .select('winner_team_id, duration_minutes')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data!.winner_team_id).toBeNull();
    expect(data!.duration_minutes).toBeNull();
  });

  test('Mettre à jour winner_team_id et duration_minutes', async () => {
    if (!supabaseTestClient || !matchId) return;

    // Get the King's Row game
    const { data: game } = await supabaseTestClient
      .from('games')
      .select('id')
      .eq('match_id', matchId)
      .eq('map_name', "King's Row")
      .maybeSingle();

    const { data: updated, error } = await supabaseTestClient
      .from('games')
      .update({
        winner_team_id: team2Id,
        duration_minutes: 22,
      })
      .eq('id', game!.id)
      .select('winner_team_id, duration_minutes')
      .maybeSingle();

    expect(error).toBeNull();
    expect(updated!.winner_team_id).toBe(team2Id);
    expect(updated!.duration_minutes).toBe(22);
  });

  test('Créer une 3e game (decider) avec overtime', async () => {
    if (!supabaseTestClient || !matchId) return;

    const { data, error } = await supabaseTestClient
      .from('games')
      .insert({
        match_id: matchId,
        map_name: 'Nepal',
        map_order: 2,
        team1_score: 3,
        team2_score: 2,
        winner_team_id: team1Id,
        duration_minutes: 25,
        is_tiebreaker: true,
        went_overtime: true,
      })
      .select('*')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data!.winner_team_id).toBe(team1Id);
    expect(data!.is_tiebreaker).toBe(true);
    expect(data!.went_overtime).toBe(true);
    expect(data!.duration_minutes).toBe(25);
  });

  test('Lister les 3 games du match triées par map_order', async () => {
    if (!supabaseTestClient || !matchId) return;

    const { data, error } = await supabaseTestClient
      .from('games')
      .select('map_name, map_order, winner_team_id, duration_minutes')
      .eq('match_id', matchId)
      .order('map_order', { ascending: true });

    expect(error).toBeNull();
    expect(data!.length).toBe(3);

    expect(data![0].map_name).toBe('Busan');
    expect(data![0].winner_team_id).toBe(team1Id);

    expect(data![1].map_name).toBe("King's Row");
    expect(data![1].winner_team_id).toBe(team2Id);

    expect(data![2].map_name).toBe('Nepal');
    expect(data![2].winner_team_id).toBe(team1Id);
    expect(data![2].duration_minutes).toBe(25);
  });

  /* -------------------------------------------------------
   * 2) Map vetos pour alimenter les tendances
   * ------------------------------------------------------*/

  test('Enregistrer un veto complet (BO3 flow)', async () => {
    if (!supabaseTestClient || !matchId) return;

    // BO3 flow: ban1, ban2, pick1, pick2, ban1, ban2, decider
    const steps = [
      { step_number: 1, action: 'ban', team_id: team1Id, map_name: 'Ilios' },
      { step_number: 2, action: 'ban', team_id: team2Id, map_name: 'Dorado' },
      { step_number: 3, action: 'pick', team_id: team1Id, map_name: 'Busan' },
      { step_number: 4, action: 'pick', team_id: team2Id, map_name: "King's Row" },
      { step_number: 5, action: 'ban', team_id: team1Id, map_name: 'Colosseo' },
      { step_number: 6, action: 'ban', team_id: team2Id, map_name: 'Route 66' },
      { step_number: 7, action: 'decider', team_id: null, map_name: 'Nepal' },
    ];

    const { error } = await supabaseTestClient
      .from('match_map_vetos')
      .insert(steps.map((s) => ({ ...s, match_id: matchId })));

    expect(error).toBeNull();

    // Verify
    const { data } = await supabaseTestClient
      .from('match_map_vetos')
      .select('action, map_name, team_id')
      .eq('match_id', matchId)
      .order('step_number', { ascending: true });

    expect(data!.length).toBe(7);
    expect(data!.filter((v: any) => v.action === 'ban').length).toBe(4);
    expect(data!.filter((v: any) => v.action === 'pick').length).toBe(2);
    expect(data!.filter((v: any) => v.action === 'decider').length).toBe(1);
  });

  /* -------------------------------------------------------
   * 3) Finir le match pour que les stats soient complètes
   * ------------------------------------------------------*/

  test('Mettre le match en finished avec score 2-1', async () => {
    if (!supabaseTestClient || !matchId) return;

    const { data, error } = await supabaseTestClient
      .from('matches')
      .update({
        team1_score: 2,
        team2_score: 1,
        winner_team_id: team1Id,
        status: 'finished',
        completed_at: new Date().toISOString(),
      })
      .eq('id', matchId)
      .select('status, team1_score, team2_score, winner_team_id')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data!.status).toBe('finished');
    expect(data!.team1_score).toBe(2);
    expect(data!.team2_score).toBe(1);
  });

  /* -------------------------------------------------------
   * 4) Map stats API: neverPlayed & teamTendencies
   * ------------------------------------------------------*/

  test('GET /api/maps/stats retourne neverPlayed et teamTendencies', async ({ request }) => {
    if (!tournamentId) return;

    const res = await request.get(`/api/maps/stats?tournamentId=${tournamentId}`);
    expect(res.status()).toBe(200);

    const json = await res.json();

    // Basic structure
    expect(json.tournamentId).toBe(tournamentId);
    expect(json.totalGames).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(json.maps)).toBe(true);
    expect(Array.isArray(json.neverPlayed)).toBe(true);
    expect(Array.isArray(json.teamTendencies)).toBe(true);
  });

  test('neverPlayed contient les maps du pool jamais jouées', async ({ request }) => {
    if (!tournamentId) return;

    const res = await request.get(`/api/maps/stats?tournamentId=${tournamentId}&minGames=0`);
    const json = await res.json();

    // Played maps: Busan, King's Row, Nepal
    // Pool maps: Busan, Ilios, King's Row, Dorado, Colosseo, Nepal, Route 66
    // Never played: Ilios, Dorado, Colosseo, Route 66
    expect(json.neverPlayed.length).toBe(4);
    expect(json.neverPlayed).toContain('Ilios');
    expect(json.neverPlayed).toContain('Dorado');
    expect(json.neverPlayed).toContain('Colosseo');
    expect(json.neverPlayed).toContain('Route 66');

    // Played maps should NOT be in neverPlayed
    expect(json.neverPlayed).not.toContain('Busan');
    expect(json.neverPlayed).not.toContain('Nepal');
    expect(json.neverPlayed).not.toContain("King's Row");
  });

  test('teamTendencies reflète les bans/picks par équipe', async ({ request }) => {
    if (!tournamentId) return;

    const res = await request.get(`/api/maps/stats?tournamentId=${tournamentId}&minGames=0`);
    const json = await res.json();

    const tendencies = json.teamTendencies as any[];
    expect(tendencies.length).toBe(2); // both teams

    // Find team1's tendencies
    const t1 = tendencies.find((t: any) => t.teamId === team1Id);
    expect(t1).toBeTruthy();
    expect(t1.totalVetos).toBe(1); // 1 match with veto

    // Team 1 banned Ilios + Colosseo, picked Busan
    expect(t1.bans.length).toBe(2);
    expect(t1.bans.map((b: any) => b.mapName).sort()).toEqual(['Colosseo', 'Ilios']);
    expect(t1.picks.length).toBe(1);
    expect(t1.picks[0].mapName).toBe('Busan');

    // Find team2's tendencies
    const t2 = tendencies.find((t: any) => t.teamId === team2Id);
    expect(t2).toBeTruthy();

    // Team 2 banned Dorado + Route 66, picked King's Row
    expect(t2.bans.map((b: any) => b.mapName).sort()).toEqual(['Dorado', 'Route 66']);
    expect(t2.picks[0].mapName).toBe("King's Row");
  });

  test('maps stats contiennent avgDuration et veto rates', async ({ request }) => {
    if (!tournamentId) return;

    const res = await request.get(`/api/maps/stats?tournamentId=${tournamentId}&minGames=0`);
    const json = await res.json();

    const busan = json.maps.find((m: any) => m.mapName === 'Busan');
    expect(busan).toBeTruthy();
    expect(busan.gamesPlayed).toBe(1);
    expect(busan.avgDuration).toBe(18);
    expect(busan.timesPicked).toBe(1); // picked by team1
    expect(busan.pickRate).toBeGreaterThan(0);

    const nepal = json.maps.find((m: any) => m.mapName === 'Nepal');
    expect(nepal).toBeTruthy();
    expect(nepal.tiebreakers).toBe(1);
    expect(nepal.overtimes).toBe(1);
    expect(nepal.timesDecider).toBe(1);
    expect(nepal.avgDuration).toBe(25);

    // Ilios was banned but never played — should appear in maps via veto only
    const ilios = json.maps.find((m: any) => m.mapName === 'Ilios');
    expect(ilios).toBeTruthy();
    expect(ilios.gamesPlayed).toBe(0);
    expect(ilios.timesBanned).toBe(1);
    expect(ilios.banRate).toBeGreaterThan(0);
  });

  test('teamWinrates utilise winner_team_id', async ({ request }) => {
    if (!tournamentId) return;

    const res = await request.get(`/api/maps/stats?tournamentId=${tournamentId}&minGames=0`);
    const json = await res.json();

    const busan = json.maps.find((m: any) => m.mapName === 'Busan');
    expect(busan.teamWinrates.length).toBeGreaterThanOrEqual(1);

    // team1 won Busan 2-0
    const t1wr = busan.teamWinrates.find((tw: any) => tw.teamId === team1Id);
    expect(t1wr).toBeTruthy();
    expect(t1wr.wins).toBe(1);
    expect(t1wr.winrate).toBe(1);
  });

  /* -------------------------------------------------------
   * 5) Team stats API includes avgDuration
   * ------------------------------------------------------*/

  test('GET /api/team/[id]/stats retourne avgDuration par map', async ({ request }) => {
    if (!team1Id) return;

    const res = await request.get(`/api/team/${team1Id}/stats`);
    expect(res.status()).toBe(200);

    const json = await res.json();
    expect(json.team.id).toBe(team1Id);
    expect(Array.isArray(json.mapStats)).toBe(true);

    // Team1 played Busan (won, 18min), King's Row (lost, 22min), Nepal (won, 25min)
    const busanStat = json.mapStats.find((m: any) => m.mapName === 'Busan');
    expect(busanStat).toBeTruthy();
    expect(busanStat.wins).toBe(1);
    expect(busanStat.avgDuration).toBe(18);

    const nepalStat = json.mapStats.find((m: any) => m.mapName === 'Nepal');
    expect(nepalStat).toBeTruthy();
    expect(nepalStat.wins).toBe(1);
    expect(nepalStat.avgDuration).toBe(25);

    const krStat = json.mapStats.find((m: any) => m.mapName === "King's Row");
    expect(krStat).toBeTruthy();
    expect(krStat.losses).toBe(1);
    expect(krStat.avgDuration).toBe(22);
  });

  test('Team stats winrate uses winner_team_id', async ({ request }) => {
    if (!team2Id) return;

    const res = await request.get(`/api/team/${team2Id}/stats`);
    const json = await res.json();

    // Team2 won King's Row (via winner_team_id), lost Busan + Nepal
    const krStat = json.mapStats.find((m: any) => m.mapName === "King's Row");
    expect(krStat).toBeTruthy();
    expect(krStat.wins).toBe(1);
    expect(krStat.losses).toBe(0);

    const busanStat = json.mapStats.find((m: any) => m.mapName === 'Busan');
    expect(busanStat).toBeTruthy();
    expect(busanStat.wins).toBe(0);
    expect(busanStat.losses).toBe(1);
  });

  /* -------------------------------------------------------
   * 6) Edge cases
   * ------------------------------------------------------*/

  test('GET /api/maps/stats avec tournoi vide retourne neverPlayed vide', async ({ request }) => {
    const fakeTournamentId = '00000000-0000-0000-0000-000000000000';
    const res = await request.get(`/api/maps/stats?tournamentId=${fakeTournamentId}`);
    expect(res.status()).toBe(200);

    const json = await res.json();
    expect(json.totalGames).toBe(0);
    expect(json.maps).toEqual([]);
    expect(json.neverPlayed).toEqual([]);
    expect(json.teamTendencies).toEqual([]);
  });

  test('GET /api/team/[id]/stats pour équipe inexistante retourne 404', async ({ request }) => {
    const fakeTeamId = '00000000-0000-0000-0000-000000000000';
    const res = await request.get(`/api/team/${fakeTeamId}/stats`);
    expect(res.status()).toBe(404);
  });
});
