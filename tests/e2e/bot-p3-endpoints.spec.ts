/**
 * Tests E2E — Bot P3 endpoints
 *
 *  GET/POST/DELETE /api/bot/v1/matches/[id]/veto
 *  POST            /api/bot/v1/stages/[id]/auto-byes
 *  POST            /api/bot/v1/announcements
 *  POST            /api/bot/v1/tournaments/[id]/clone
 *  PATCH           /api/bot/v1/teams/[id]/discord
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
  return `${9_500_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(1);
const PLAYER_DISCORD = discordId(2);
const ADMIN_EMAIL = `bot-p3-adm-${TS}@test.local`;
const PLAYER_EMAIL = `bot-p3-pl-${TS}@test.local`;

let adminAuthId: string;
let playerAuthId: string;
let tournamentId: string;
let stageId: string;
let teamAId: string;
let teamBId: string;
let matchWithBothTeamsId: string;
let matchWithOneTeamId: string;
let createdAnnouncementId: string | null = null;
let createdCloneId: string | null = null;

test.describe.serial('Bot P3 — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    const player = await createTestPlayer(PLAYER_EMAIL, 'TestPass123!');
    playerAuthId = player!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      { auth_user_id: adminAuthId, discord_user_id: ADMIN_DISCORD, discord_username: `p3_adm_${TS}` },
      { auth_user_id: playerAuthId, discord_user_id: PLAYER_DISCORD, discord_username: `p3_pl_${TS}` },
    ]);

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `P3 Tour ${TS}`,
        slug: `p3-tour-${TS}`,
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
          name: `P3 A ${TS}`,
          slug: `p3-a-${TS}`,
          captain_id: adminAuthId,
        })
        .select('id')
        .single(),
      supabaseTestClient
        .from('teams')
        .insert({
          name: `P3 B ${TS}`,
          slug: `p3-b-${TS}`,
          captain_id: playerAuthId,
        })
        .select('id')
        .single(),
    ]);
    teamAId = a!.id;
    teamBId = b!.id;

    // Match avec les deux teams (pour /veto)
    const { data: mFull } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'pending',
        round_number: 1,
        team1_id: teamAId,
        team2_id: teamBId,
        match_format: 'bo3',
      })
      .select('id')
      .single();
    matchWithBothTeamsId = mFull!.id;

    // Match avec une seule team (pour /auto-byes)
    const { data: mBye } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'pending',
        round_number: 2,
        team1_id: teamAId,
        team2_id: null,
      })
      .select('id')
      .single();
    matchWithOneTeamId = mBye!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdCloneId) {
      await supabaseTestClient.from('tournament_stages').delete().eq('tournament_id', createdCloneId);
      await supabaseTestClient.from('tournament_maps').delete().eq('tournament_id', createdCloneId);
      await supabaseTestClient.from('tournaments').delete().eq('id', createdCloneId);
    }
    if (createdAnnouncementId) {
      await supabaseTestClient.from('announcements').delete().eq('id', createdAnnouncementId);
    }
    for (const mid of [matchWithBothTeamsId, matchWithOneTeamId].filter(Boolean)) {
      await supabaseTestClient.from('games').delete().eq('match_id', mid);
      await supabaseTestClient.from('match_map_vetos').delete().eq('match_id', mid);
      await supabaseTestClient.from('matches').delete().eq('id', mid);
    }
    if (stageId) {
      await supabaseTestClient.from('tournament_stages').delete().eq('id', stageId);
    }
    if (tournamentId) {
      await supabaseTestClient.from('tournaments').delete().eq('id', tournamentId);
    }
    for (const tid of [teamAId, teamBId].filter(Boolean)) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', tid);
      await supabaseTestClient.from('teams').delete().eq('id', tid);
    }
    for (const aid of [adminAuthId, playerAuthId].filter(Boolean)) {
      await supabaseTestClient.from('user_discord_links').delete().eq('auth_user_id', aid);
    }
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(matchWithBothTeamsId).toBeTruthy();
    expect(matchWithOneTeamId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* /veto                                                                     */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /veto', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('GET 200 retourne le flow + 0 steps', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/matches/${matchWithBothTeamsId}/veto`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.format).toBe('bo3');
    expect(body.flow.length).toBeGreaterThan(0);
    expect(body.steps).toEqual([]);
    expect(body.isComplete).toBe(false);
  });

  test('POST 403 si actor non admin', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${matchWithBothTeamsId}/veto`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: PLAYER_DISCORD, action: 'ban', mapName: 'Ilios' },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('POST 400 si action invalide', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${matchWithBothTeamsId}/veto`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, action: 'destroy', mapName: 'Ilios' },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('POST 201 enregistre un ban', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${matchWithBothTeamsId}/veto`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          action: 'ban',
          mapName: 'Ilios',
          teamId: teamAId,
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.step.action).toBe('ban');
    expect(body.step.map_name).toBe('Ilios');
  });

  test('POST 400 sur map déjà utilisée', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/matches/${matchWithBothTeamsId}/veto`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, action: 'ban', mapName: 'Ilios' },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('DELETE 200 reset', async ({ request }) => {
    const res = await request.delete(
      `/api/bot/v1/matches/${matchWithBothTeamsId}/veto`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.stepsDeleted).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------------- */
/* /auto-byes                                                                */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /auto-byes', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/stages/${stageId}/auto-byes`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: PLAYER_DISCORD },
    });
    expect(res.status()).toBe(403);
  });

  test('200 traite le match XOR-team', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/stages/${stageId}/auto-byes`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.updatedMatchIds).toContain(matchWithOneTeamId);

    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('is_bye, status, winner_team_id')
      .eq('id', matchWithOneTeamId)
      .single();
    expect(m!.is_bye).toBe(true);
    expect(m!.status).toBe('finished');
    expect(m!.winner_team_id).toBe(teamAId);
  });
});

/* ------------------------------------------------------------------------- */
/* /announcements                                                            */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /announcements', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/announcements`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: PLAYER_DISCORD, title: 't', message: 'm' },
    });
    expect(res.status()).toBe(403);
  });

  test('400 si title manquant', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/announcements`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD, message: 'no title' },
    });
    expect(res.status()).toBe(400);
  });

  test('400 si ctaUrl invalide', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/announcements`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        title: 'X',
        message: 'Y',
        ctaUrl: 'javascript:alert(1)',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('201 happy path', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/announcements`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        title: `P3 Annonce ${TS}`,
        message: 'Test',
        priority: 5,
        isActive: false, // pas de Discord notify
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.announcement.title).toContain('P3 Annonce');
    expect(body.announcement.priority).toBe(5);
    createdAnnouncementId = body.announcement.id;
  });
});

/* ------------------------------------------------------------------------- */
/* /clone                                                                    */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /clone', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${tournamentId}/clone`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: PLAYER_DISCORD },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('201 clone le tournoi + stages', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${tournamentId}/clone`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          name: `Clone P3 ${TS}`,
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.tournament.name).toContain('Clone P3');
    expect(body.tournament.status).toBe('draft');
    expect(body.stages.length).toBeGreaterThan(0);
    expect(body.clonedFrom).toBe(tournamentId);
    createdCloneId = body.tournament.id;
  });
});

/* ------------------------------------------------------------------------- */
/* /teams/[id]/discord (write-back)                                          */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot Discord write-back', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamAId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: PLAYER_DISCORD,
        discordRoleId: '123456789012345678',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('400 si role pas snowflake', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamAId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD, discordRoleId: 'not-a-id' },
    });
    expect(res.status()).toBe(400);
  });

  test('200 update role + channel', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamAId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        discordRoleId: '111111111111111111',
        discordChannelId: '222222222222222222',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.team.discord_role_id).toBe('111111111111111111');
    expect(body.team.discord_channel_id).toBe('222222222222222222');
  });

  test('200 null efface le champ', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamAId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD, discordRoleId: null },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.team.discord_role_id).toBeNull();
  });
});
