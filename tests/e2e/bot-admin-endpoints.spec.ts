/**
 * Tests E2E — Bot admin endpoints
 *
 *  POST /api/bot/v1/tournaments/[id]/status   /publier-tournoi
 *  POST /api/bot/v1/matches/[id]/forfeit      /forfait
 *  POST /api/bot/v1/matches/[id]/reset        /reset-match
 *  GET  /api/bot/v1/staff-logs                /logs
 *  GET  /api/bot/v1/demandes                  /demandes
 *
 * Tous nécessitent un acteur staff admin/owner. Pas de filtres exhaustifs ici :
 * on couvre auth, méthode, validation business clé, happy path + 1 effet DB.
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
  return `${8_900_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(1);
const PLAYER_DISCORD = discordId(2);
const ADMIN_EMAIL = `bot-admin-${TS}@test.local`;
const PLAYER_EMAIL = `bot-admin-pl-${TS}@test.local`;

let adminAuthId: string;
let playerAuthId: string;
let draftTournamentId: string;
let stageId: string;
let teamId: string;
let opponentTeamId: string;
let matchId: string;

test.describe.serial('Bot admin endpoints — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    const player = await createTestPlayer(PLAYER_EMAIL, 'TestPass123!');
    playerAuthId = player!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      {
        auth_user_id: adminAuthId,
        discord_user_id: ADMIN_DISCORD,
        discord_username: `bot_adm_${TS}`,
      },
      {
        auth_user_id: playerAuthId,
        discord_user_id: PLAYER_DISCORD,
        discord_username: `bot_pl_${TS}`,
      },
    ]);

    // Tournoi en draft avec 1 stage et 1 match -> couvre publish + forfeit + reset
    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot Admin Tour ${TS}`,
        slug: `bot-admin-tour-${TS}`,
        status: 'draft',
        game: 'overwatch',
      })
      .select('id')
      .single();
    draftTournamentId = tour!.id;

    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: draftTournamentId,
        name: 'Phase 1',
        kind: 'bracket',
        stage_type: 'bracket',
        order_index: 0,
      })
      .select('id')
      .single();
    stageId = stage!.id;

    const [{ data: t1 }, { data: t2 }] = await Promise.all([
      supabaseTestClient
        .from('teams')
        .insert({
          name: `Bot Admin Team A ${TS}`,
          slug: `bot-admin-team-a-${TS}`,
          captain_id: playerAuthId,
        })
        .select('id')
        .single(),
      supabaseTestClient
        .from('teams')
        .insert({
          name: `Bot Admin Team B ${TS}`,
          slug: `bot-admin-team-b-${TS}`,
          captain_id: adminAuthId,
        })
        .select('id')
        .single(),
    ]);
    teamId = t1!.id;
    opponentTeamId = t2!.id;

    const { data: match } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: draftTournamentId,
        stage_id: stageId,
        status: 'pending',
        round_number: 1,
        team1_id: teamId,
        team2_id: opponentTeamId,
        match_format: 'bo3',
      })
      .select('id')
      .single();
    matchId = match!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (matchId) {
      await supabaseTestClient.from('matches').delete().eq('id', matchId);
    }
    if (stageId) {
      await supabaseTestClient
        .from('tournament_stages')
        .delete()
        .eq('id', stageId);
    }
    if (draftTournamentId) {
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', draftTournamentId);
    }
    for (const tid of [teamId, opponentTeamId].filter(Boolean)) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', tid);
      await supabaseTestClient.from('teams').delete().eq('id', tid);
    }
    for (const aid of [adminAuthId, playerAuthId].filter(Boolean)) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .eq('auth_user_id', aid);
    }
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(draftTournamentId).toBeTruthy();
    expect(matchId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* /publier-tournoi                                                          */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /publier-tournoi — POST /tournaments/[id]/status', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('401 sans clé', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${draftTournamentId}/status`,
      { data: {} }
    );
    expect([401, 500]).toContain(res.status());
  });

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${draftTournamentId}/status`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: PLAYER_DISCORD, status: 'published' },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('400 si status invalide', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${draftTournamentId}/status`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, status: 'running' },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('200 happy path : draft -> published', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${draftTournamentId}/status`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, status: 'published' },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tournament.status).toBe('published');
    expect(body.previousStatus).toBe('draft');

    const { data: t } = await supabaseTestClient!
      .from('tournaments')
      .select('status')
      .eq('id', draftTournamentId)
      .single();
    expect(t!.status).toBe('published');
  });

  test('409 si déjà dans ce status', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${draftTournamentId}/status`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, status: 'published' },
      }
    );
    expect(res.status()).toBe(409);
  });
});

/* ------------------------------------------------------------------------- */
/* /forfait                                                                  */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /forfait — POST /matches/[id]/forfeit', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/matches/${matchId}/forfeit`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: PLAYER_DISCORD,
        forfeitTeamId: teamId,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('400 si forfeitTeamId pas dans le match', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/matches/${matchId}/forfeit`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        forfeitTeamId: '00000000-0000-0000-0000-000000000001',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('200 happy path : team A forfait, walkover + winner=team B', async ({
    request,
  }) => {
    const res = await request.post(`/api/bot/v1/matches/${matchId}/forfeit`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        forfeitTeamId: teamId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.winnerTeamId).toBe(opponentTeamId);

    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('status, winner_team_id, forfeit_team_id')
      .eq('id', matchId)
      .single();
    expect(m!.status).toBe('walkover');
    expect(m!.winner_team_id).toBe(opponentTeamId);
    expect(m!.forfeit_team_id).toBe(teamId);
  });
});

/* ------------------------------------------------------------------------- */
/* /reset-match                                                              */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /reset-match — POST /matches/[id]/reset', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/matches/${matchId}/reset`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: PLAYER_DISCORD },
    });
    expect(res.status()).toBe(403);
  });

  test('200 happy path : reset après walkover -> status=pending', async ({
    request,
  }) => {
    const res = await request.post(`/api/bot/v1/matches/${matchId}/reset`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.previousStatus).toBe('walkover');

    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('status, team1_score, team2_score, winner_team_id, forfeit_team_id')
      .eq('id', matchId)
      .single();
    expect(m!.status).toBe('pending');
    expect(m!.team1_score).toBeNull();
    expect(m!.team2_score).toBeNull();
    expect(m!.winner_team_id).toBeNull();
    expect(m!.forfeit_team_id).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* /logs                                                                     */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /logs — GET /staff-logs', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/staff-logs?actorDiscordUserId=${PLAYER_DISCORD}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(403);
  });

  test('200 + contient des entrées (forfeit + reset précédents ont logué)', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/staff-logs?actorDiscordUserId=${ADMIN_DISCORD}&limit=50&tournament=${draftTournamentId}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.logs)).toBe(true);
    // /forfait et /reset précédents ont écrit dans staff_logs via le helper
    expect(body.logs.length).toBeGreaterThan(0);
    expect(body.logs[0]).toHaveProperty('createdAt');
    expect(body.logs[0]).toHaveProperty('action');
  });
});

/* ------------------------------------------------------------------------- */
/* /demandes                                                                 */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /demandes — GET /demandes', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  let createdDemandeId: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    // Crée une demande pending pour avoir au moins 1 entrée à lister
    const { data } = await supabaseTestClient
      .from('demandes')
      .insert({
        user_id: playerAuthId,
        team_id: teamId,
        type: 'join',
        status: 'pending',
        source: 'website',
        comment: `test demande ${TS}`,
      })
      .select('id')
      .single();
    createdDemandeId = data!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient || !createdDemandeId) return;
    await supabaseTestClient.from('demandes').delete().eq('id', createdDemandeId);
  });

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/demandes?actorDiscordUserId=${PLAYER_DISCORD}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(403);
  });

  test('400 si status invalide', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/demandes?actorDiscordUserId=${ADMIN_DISCORD}&status=foo`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });

  test('200 + retrouve la demande créée', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/demandes?actorDiscordUserId=${ADMIN_DISCORD}&type=join&status=pending&limit=50`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.demandes.find((d: { id: string }) => d.id === createdDemandeId);
    expect(found).toBeTruthy();
    expect(found.status).toBe('pending');
    expect(found.type).toBe('join');
  });
});
