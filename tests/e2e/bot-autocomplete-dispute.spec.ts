/**
 * Tests E2E — Bot autocomplete + dispute
 *
 *  GET  /api/bot/v1/autocomplete/tournaments
 *  GET  /api/bot/v1/autocomplete/teams
 *  GET  /api/bot/v1/autocomplete/matches
 *  GET  /api/bot/v1/disputes                          /disputes (staff)
 *  POST /api/bot/v1/matches/[id]/resolve-dispute      /resoudre-dispute (staff)
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestStaff,
  createTestPlayer,
  deleteTestStaff,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

function discordId(suffix: number): string {
  return `${9_100_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(1);
const CAPTAIN_DISCORD = discordId(2);
const ADMIN_EMAIL = `bot-ac-adm-${TS}@test.local`;
const CAPTAIN_EMAIL = `bot-ac-cap-${TS}@test.local`;

let adminAuthId: string;
let captainAuthId: string;
let teamAId: string;
let teamBId: string;
let tournamentId: string;
let stageId: string;
let disputedMatchId: string;

test.describe.serial('Bot autocomplete + dispute — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    const cap = await createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!');
    captainAuthId = cap!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      {
        auth_user_id: adminAuthId,
        discord_user_id: ADMIN_DISCORD,
        discord_username: `ac_adm_${TS}`,
      },
      {
        auth_user_id: captainAuthId,
        discord_user_id: CAPTAIN_DISCORD,
        discord_username: `ac_cap_${TS}`,
      },
    ]);

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `AC Tour Zorglub ${TS}`,
        slug: `ac-tour-zorglub-${TS}`,
        status: 'published',
        game: 'overwatch',
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Phase 1',
        kind: 'bracket',
        stage_type: 'bracket',
        order_index: 0,
      })
      .select('id')
      .single();
    stageId = stage!.id;

    const [{ data: a }, { data: b }] = await Promise.all([
      supabaseTestClient
        .from('teams')
        .insert({
          name: `AC Team Alpha ${TS}`,
          slug: `ac-team-alpha-${TS}`,
          captain_id: captainAuthId,
        })
        .select('id')
        .single(),
      supabaseTestClient
        .from('teams')
        .insert({
          name: `AC Team Beta ${TS}`,
          slug: `ac-team-beta-${TS}`,
          captain_id: adminAuthId,
        })
        .select('id')
        .single(),
    ]);
    teamAId = a!.id;
    teamBId = b!.id;

    // Capitaine est aussi membre de A (sinon resolveActorPlayer ne le voit
    // pas comme membre de match) — il a deja captain_id mais on insert dans
    // team_members aussi pour l'autocomplete /matches actorDiscordUserId.
    await supabaseTestClient.from('team_members').insert([
      { team_id: teamAId, user_id: captainAuthId, role: 'captain' },
    ]);

    await supabaseTestClient.from('stage_teams').insert([
      { stage_id: stageId, team_id: teamAId },
      { stage_id: stageId, team_id: teamBId },
    ]);

    // Match en dispute pour tester GET /disputes + POST /resolve-dispute
    const { data: match } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'disputed',
        round_number: 1,
        team1_id: teamAId,
        team2_id: teamBId,
        match_format: 'bo3',
        dispute_reason: 'Test dispute',
        dispute_opened_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    disputedMatchId = match!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (disputedMatchId) {
      await supabaseTestClient
        .from('match_score_reports')
        .delete()
        .eq('match_id', disputedMatchId);
      await supabaseTestClient.from('matches').delete().eq('id', disputedMatchId);
    }
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
    if (tournamentId) {
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    }
    for (const tid of [teamAId, teamBId].filter(Boolean)) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', tid);
      await supabaseTestClient.from('teams').delete().eq('id', tid);
    }
    for (const aid of [adminAuthId, captainAuthId].filter(Boolean)) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .eq('auth_user_id', aid);
    }
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestUser(CAPTAIN_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(tournamentId).toBeTruthy();
    expect(disputedMatchId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* Autocomplete                                                              */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot autocomplete', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('tournaments : q substring trouve le tournoi setup', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/autocomplete/tournaments?q=Zorglub`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.results.find(
      (r: { value: string }) => r.value === tournamentId
    );
    expect(found).toBeTruthy();
    expect(found.label).toContain('Zorglub');
  });

  test('tournaments : payload sans clé renvoie 401', async ({ request }) => {
    const res = await request.get(`/api/bot/v1/autocomplete/tournaments`);
    expect([401, 500]).toContain(res.status());
  });

  test('teams : recherche par nom partiel', async ({ request }) => {
    const res = await request.get(`/api/bot/v1/autocomplete/teams?q=Alpha`, {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.results.find(
      (r: { value: string }) => r.value === teamAId
    );
    expect(found).toBeTruthy();
  });

  test('teams : filtre tournamentId scope aux teams inscrites', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/autocomplete/teams?tournamentId=${tournamentId}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = body.results.map((r: { value: string }) => r.value);
    expect(ids).toContain(teamAId);
    expect(ids).toContain(teamBId);
  });

  test('matches : filtre par tournoi', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/autocomplete/matches?tournamentId=${tournamentId}&status=disputed`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeGreaterThan(0);
    const found = body.results.find(
      (r: { value: string }) => r.value === disputedMatchId
    );
    expect(found).toBeTruthy();
    expect(found.label).toContain('vs');
  });

  test('matches : actorDiscordUserId scope aux matchs du joueur', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/autocomplete/matches?actorDiscordUserId=${CAPTAIN_DISCORD}&status=disputed`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeGreaterThan(0);
  });

  test('matches : actor non lié renvoie liste vide (jamais 4xx)', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/autocomplete/matches?actorDiscordUserId=${discordId(99)}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */
/* /disputes + /resolve-dispute                                              */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot disputes — list + resolve', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('GET /disputes 403 si actor non admin', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/disputes?actorDiscordUserId=${CAPTAIN_DISCORD}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(403);
  });

  test('GET /disputes : retourne le match en dispute', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/disputes?actorDiscordUserId=${ADMIN_DISCORD}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.disputes.find(
      (d: { matchId: string }) => d.matchId === disputedMatchId
    );
    expect(found).toBeTruthy();
    expect(found.reason).toBe('Test dispute');
    expect(found.team1.id).toBe(teamAId);
    expect(found.team2.id).toBe(teamBId);
  });

  test('POST /resolve-dispute 403 si actor non admin', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${disputedMatchId}/resolve-dispute`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          resolution: 'noop',
          team1Score: 2,
          team2Score: 1,
        },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('POST /resolve-dispute 400 sans resolution', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${disputedMatchId}/resolve-dispute`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          team1Score: 2,
          team2Score: 1,
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('POST /resolve-dispute 400 si finished sans score ni forfait', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${disputedMatchId}/resolve-dispute`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          resolution: 'Au pif',
          resumeStatus: 'finished',
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('200 happy path : applique score 2-1 + match -> finished', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${disputedMatchId}/resolve-dispute`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          resolution: 'Vidéo de la stream confirme TeamA',
          team1Score: 2,
          team2Score: 1,
          resumeStatus: 'finished',
        },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('finished');

    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select(
        'status, team1_score, team2_score, winner_team_id, dispute_resolution, dispute_resolved_at'
      )
      .eq('id', disputedMatchId)
      .single();
    expect(m!.status).toBe('finished');
    expect(m!.team1_score).toBe(2);
    expect(m!.team2_score).toBe(1);
    expect(m!.winner_team_id).toBe(teamAId);
    expect(m!.dispute_resolution).toContain('Vidéo');
    expect(m!.dispute_resolved_at).toBeTruthy();
  });

  test('409 si on tente de résoudre un match non disputé', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${disputedMatchId}/resolve-dispute`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          resolution: 'Re-tentative',
          team1Score: 2,
          team2Score: 1,
        },
      }
    );
    expect(res.status()).toBe(409);
  });
});
