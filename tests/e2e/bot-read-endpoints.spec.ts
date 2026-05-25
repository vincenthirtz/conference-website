/**
 * Tests E2E — Bot read-only endpoints
 *
 *  GET /api/bot/v1/tournaments/[id]/teams        /participants
 *  GET /api/bot/v1/tournaments/[id]/bracket      /bracket
 *  GET /api/bot/v1/players/by-discord/[id]/reminders   /rappels
 *
 * Couvre :
 *  - auth + method
 *  - validation d'UUID / Discord ID
 *  - 404 pour tournoi/player inconnu
 *  - happy paths avec données setupées en base
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
  return `${8_700_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const CAPTAIN_DISCORD = discordId(1);
const CAPTAIN_EMAIL = `bot-read-cap-${TS}@test.local`;

let captainAuthId: string;
let teamId: string;
let tournamentId: string;
let stageId: string;
let upcomingMatchId: string;

test.describe.serial('Bot read endpoints — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const cap = await createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!');
    captainAuthId = cap!.id;
    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: captainAuthId,
      discord_user_id: CAPTAIN_DISCORD,
      discord_username: `cap_read_${TS}`,
    });

    const { data: t } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Bot Read Team ${TS}`,
        slug: `bot-read-team-${TS}`,
        captain_id: captainAuthId,
        is_active: true,
      })
      .select('id')
      .single();
    teamId = t!.id;
    await supabaseTestClient.from('team_members').insert({
      team_id: teamId,
      user_id: captainAuthId,
      role: 'captain',
    });

    // Tournoi qui démarre dans 3 jours (window /rappels = 7j) -> doit
    // apparaitre dans tournament_j1
    const startsIn3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot Read Tour ${TS}`,
        slug: `bot-read-tour-${TS}`,
        status: 'published',
        game: 'overwatch',
        start_date: startsIn3Days,
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Swiss Phase 1',
        kind: 'swiss',
        stage_type: 'swiss',
        order_index: 0,
      })
      .select('id')
      .single();
    stageId = stage!.id;

    // Team inscrite -> /participants doit la voir
    await supabaseTestClient.from('stage_teams').insert({
      stage_id: stageId,
      team_id: teamId,
    });

    // Un match pending dans 6h pour /rappels (window 48h) et /bracket
    const scheduledIn6h = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const { data: match } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'pending',
        round_number: 1,
        scheduled_at: scheduledIn6h,
        team1_id: teamId,
        team2_id: null,
      })
      .select('id')
      .single();
    upcomingMatchId = match!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (upcomingMatchId) {
      await supabaseTestClient.from('matches').delete().eq('id', upcomingMatchId);
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
    if (teamId) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', teamId);
      await supabaseTestClient.from('teams').delete().eq('id', teamId);
    }
    if (captainAuthId) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .eq('auth_user_id', captainAuthId);
    }
    await deleteTestUser(CAPTAIN_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(tournamentId).toBeTruthy();
    expect(teamId).toBeTruthy();
    expect(stageId).toBeTruthy();
    expect(upcomingMatchId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* GET /api/bot/v1/tournaments/[id]/teams   (participants)                   */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot GET participants', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('401 sans clé', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/tournaments/${tournamentId}/teams`
    );
    expect([401, 500]).toContain(res.status());
  });

  test('400 si tournamentId invalide', async ({ request }) => {
    const res = await request.get('/api/bot/v1/tournaments/not-a-uuid/teams', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(400);
  });

  test('404 si tournoi introuvable', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/tournaments/00000000-0000-0000-0000-000000000000/teams',
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(404);
  });

  test('200 : équipe inscrite renvoyée avec capitaine + discordUserId', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/tournaments/${tournamentId}/teams`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tournament.id).toBe(tournamentId);
    expect(body.teams.length).toBe(1);
    expect(body.teams[0].id).toBe(teamId);
    expect(body.teams[0].captain.discordUserId).toBe(CAPTAIN_DISCORD);
    expect(body.teams[0].memberCount).toBe(1);
  });
});

/* ------------------------------------------------------------------------- */
/* GET /api/bot/v1/tournaments/[id]/bracket                                  */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot GET bracket', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('400 si tournamentId invalide', async ({ request }) => {
    const res = await request.get('/api/bot/v1/tournaments/abc/bracket', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(400);
  });

  test('400 si stageId mal formé', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/tournaments/${tournamentId}/bracket?stageId=foo`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });

  test('404 si tournoi introuvable', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/tournaments/00000000-0000-0000-0000-000000000000/bracket',
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(404);
  });

  test('200 : stage swiss avec match pending + standings (initiales)', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/tournaments/${tournamentId}/bracket`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.stages.length).toBe(1);
    const stage = body.stages[0];
    expect(stage.id).toBe(stageId);
    expect(stage.stageType).toBe('swiss');
    expect(stage.matches.length).toBe(1);
    expect(stage.matches[0].id).toBe(upcomingMatchId);
    expect(stage.matches[0].status).toBe('pending');
    // Standings calculées même sans match joué (0 partout)
    expect(Array.isArray(stage.standings)).toBe(true);
    expect(stage.standings.length).toBe(1);
    expect(stage.standings[0].teamId).toBe(teamId);
    expect(stage.standings[0].wins).toBe(0);
    expect(stage.standings[0].rank).toBe(1);
  });

  test('200 avec ?stageId= ne renvoie que la phase ciblée', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/tournaments/${tournamentId}/bracket?stageId=${stageId}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.stages.length).toBe(1);
    expect(body.stages[0].id).toBe(stageId);
  });
});

/* ------------------------------------------------------------------------- */
/* GET /api/bot/v1/players/by-discord/[id]/reminders                         */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot GET player reminders', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('400 si discordUserId invalide', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/players/by-discord/abc/reminders',
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });

  test('404 si Discord ID non lié', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${discordId(77)}/reminders`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(404);
  });

  test('200 : capitaine reçoit match_checkin (J+6h) et tournament_j1 (J+3j)', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${CAPTAIN_DISCORD}/reminders`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    const kinds = body.upcoming.map((r: { kind: string }) => r.kind);
    expect(kinds).toContain('match_checkin');
    expect(kinds).toContain('tournament_j1');

    const match = body.upcoming.find(
      (r: { kind: string }) => r.kind === 'match_checkin'
    );
    expect(match.matchId).toBe(upcomingMatchId);
    expect(match.teamName).toContain('Bot Read Team');
    expect(match.isCheckedIn).toBe(false);

    const j1 = body.upcoming.find(
      (r: { kind: string }) => r.kind === 'tournament_j1'
    );
    expect(j1.tournamentId).toBe(tournamentId);
  });
});
