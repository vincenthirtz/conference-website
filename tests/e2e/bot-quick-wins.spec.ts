/**
 * Tests E2E — Bot P4 "quick wins"
 *
 *  GET  /api/bot/v1/teams/[id]/invitations?status=
 *  GET  /api/bot/v1/players/by-discord/[id]/history
 *  GET  /api/bot/v1/twitch/live              (degrade gracieux si Twitch unset)
 *  GET  /api/bot/v1/leaderboards/teams
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestPlayer,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

function discordId(suffix: number): string {
  return `${1_010_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const CAPTAIN_DISCORD = discordId(1);
const INVITEE_DISCORD = discordId(2);
const CAPTAIN_EMAIL = `qw-cap-${TS}@test.local`;
const INVITEE_EMAIL = `qw-inv-${TS}@test.local`;

let captainAuthId: string;
let inviteeAuthId: string;
let tournamentId: string;
let stageId: string;
let teamAId: string;
let teamBId: string;
let invitationId: string;

test.describe.serial('Quick wins — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const cap = await createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!');
    captainAuthId = cap!.id;
    const inv = await createTestPlayer(INVITEE_EMAIL, 'TestPass123!');
    inviteeAuthId = inv!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      {
        auth_user_id: captainAuthId,
        discord_user_id: CAPTAIN_DISCORD,
        discord_username: `qw_cap_${TS}`,
      },
      {
        auth_user_id: inviteeAuthId,
        discord_user_id: INVITEE_DISCORD,
        discord_username: `qw_inv_${TS}`,
      },
    ]);

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `QW Tour ${TS}`,
        slug: `qw-tour-${TS}`,
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
        name: 'Phase',
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
          name: `QW A ${TS}`,
          slug: `qw-a-${TS}`,
          captain_id: captainAuthId,
        })
        .select('id')
        .single(),
      supabaseTestClient
        .from('teams')
        .insert({
          name: `QW B ${TS}`,
          slug: `qw-b-${TS}`,
          captain_id: inviteeAuthId,
        })
        .select('id')
        .single(),
    ]);
    teamAId = a!.id;
    teamBId = b!.id;

    await supabaseTestClient.from('team_members').insert([
      { team_id: teamAId, user_id: captainAuthId, role: 'captain' },
      { team_id: teamBId, user_id: inviteeAuthId, role: 'captain' },
    ]);

    // 2 matchs finished pour leaderboards + history
    const finishedMatches = [
      {
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'finished',
        round_number: 1,
        team1_id: teamAId,
        team2_id: teamBId,
        team1_score: 2,
        team2_score: 0,
        winner_team_id: teamAId,
        match_format: 'bo3',
        completed_at: new Date().toISOString(),
      },
      {
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'finished',
        round_number: 2,
        team1_id: teamBId,
        team2_id: teamAId,
        team1_score: 2,
        team2_score: 1,
        winner_team_id: teamBId,
        match_format: 'bo3',
        completed_at: new Date().toISOString(),
      },
    ];
    await supabaseTestClient.from('matches').insert(finishedMatches);

    // 1 invitation pending pour /invitations GET
    const { data: dem } = await supabaseTestClient
      .from('demandes')
      .insert({
        user_id: inviteeAuthId,
        team_id: teamAId,
        type: 'invite',
        status: 'pending',
        source: 'discord_bot',
        payload: {
          captain_auth_user_id: captainAuthId,
          captain_discord_user_id: CAPTAIN_DISCORD,
          invitee_discord_user_id: INVITEE_DISCORD,
          desired_role: 'player',
          battle_tag: null,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
        },
      })
      .select('id')
      .single();
    invitationId = dem!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (invitationId) {
      await supabaseTestClient.from('demandes').delete().eq('id', invitationId);
    }
    if (stageId) {
      await supabaseTestClient.from('matches').delete().eq('stage_id', stageId);
      await supabaseTestClient.from('tournament_stages').delete().eq('id', stageId);
    }
    if (tournamentId) {
      await supabaseTestClient.from('tournaments').delete().eq('id', tournamentId);
    }
    for (const tid of [teamAId, teamBId].filter(Boolean)) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', tid);
      await supabaseTestClient.from('teams').delete().eq('id', tid);
    }
    for (const aid of [captainAuthId, inviteeAuthId].filter(Boolean)) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .eq('auth_user_id', aid);
    }
    await deleteTestUser(CAPTAIN_EMAIL);
    await deleteTestUser(INVITEE_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(teamAId).toBeTruthy();
    expect(invitationId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* GET /teams/[id]/invitations                                               */
/* ------------------------------------------------------------------------- */

test.describe.serial('Team invitations GET', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('200 retourne l’invitation pending', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/teams/${teamAId}/invitations?status=pending`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.teamId).toBe(teamAId);
    const found = body.invitations.find(
      (i: { id: string }) => i.id === invitationId
    );
    expect(found).toBeTruthy();
    expect(found.status).toBe('pending');
    expect(found.inviteeDiscordUserId).toBe(INVITEE_DISCORD);
  });

  test('400 si status invalide', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/teams/${teamAId}/invitations?status=foo`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });

  test('status=all retourne aussi les invites non-pending', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/teams/${teamAId}/invitations?status=all`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.invitations.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------------- */
/* GET /players/.../history                                                  */
/* ------------------------------------------------------------------------- */

test.describe.serial('Player history GET', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('200 capitaine A : 2 matchs, 1W/1L', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${CAPTAIN_DISCORD}/history`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary.total).toBe(2);
    expect(body.summary.wins).toBe(1);
    expect(body.summary.losses).toBe(1);
    // Sur le 1er match (le plus recent), capitaine A a perdu (B a gagne 2-1)
    const first = body.matches[0];
    expect(first.myTeam.id).toBe(teamAId);
    expect(first.opponentTeam.id).toBe(teamBId);
  });

  test('404 si discord non lié', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${discordId(99)}/history`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(404);
  });

  test('400 si discord ID invalide', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/players/by-discord/abc/history',
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });
});

/* ------------------------------------------------------------------------- */
/* GET /twitch/live                                                          */
/* ------------------------------------------------------------------------- */

test.describe.serial('Twitch live GET', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('200 (peut être vide si aucun channel ou Twitch unset)', async ({
    request,
  }) => {
    const res = await request.get('/api/bot/v1/twitch/live?includeOffline=1', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.channels)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.liveCount).toBe('number');
  });
});

/* ------------------------------------------------------------------------- */
/* GET /leaderboards/teams                                                   */
/* ------------------------------------------------------------------------- */

test.describe.serial('Leaderboards teams GET', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('200 inclut team A et B (1W/1L chacune)', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/leaderboards/teams?tournamentId=${tournamentId}&period=all`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const a = body.leaderboard.find(
      (r: { teamId: string }) => r.teamId === teamAId
    );
    const b = body.leaderboard.find(
      (r: { teamId: string }) => r.teamId === teamBId
    );
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
    expect(b.wins).toBe(1);
    expect(b.losses).toBe(1);
  });

  test('400 si tournamentId invalide', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/leaderboards/teams?tournamentId=not-a-uuid',
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });
});
