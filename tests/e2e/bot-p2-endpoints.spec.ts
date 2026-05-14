/**
 * Tests E2E — Bot P2 endpoints
 *
 *  PATCH  /api/bot/v1/matches/[id]                      (admin meta)
 *  PATCH  /api/bot/v1/players/by-discord/[id]/profile   (self-service)
 *  GET    /api/bot/v1/matches/[id]/cast                 (list)
 *  POST   /api/bot/v1/matches/[id]/cast                 (admin assign)
 *  DELETE /api/bot/v1/matches/[id]/cast                 (admin unassign)
 *  GET    /api/bot/v1/cast/assignments                  (list with window)
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
  return `${9_300_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(1);
const CASTER_DISCORD = discordId(2);
const PLAYER_DISCORD = discordId(3);
const ADMIN_EMAIL = `bot-p2-adm-${TS}@test.local`;
const CASTER_EMAIL = `bot-p2-cast-${TS}@test.local`;
const PLAYER_EMAIL = `bot-p2-pl-${TS}@test.local`;

let adminAuthId: string;
let casterAuthId: string;
let playerAuthId: string;
let castMemberId: string;
let tournamentId: string;
let stageId: string;
let teamAId: string;
let teamBId: string;
let matchId: string;

test.describe.serial('Bot P2 — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    const caster = await createTestStaff(CASTER_EMAIL, 'TestPass123!', 'caster');
    casterAuthId = caster!.id;
    const player = await createTestPlayer(PLAYER_EMAIL, 'TestPass123!');
    playerAuthId = player!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      { auth_user_id: adminAuthId, discord_user_id: ADMIN_DISCORD, discord_username: `p2_adm_${TS}` },
      { auth_user_id: casterAuthId, discord_user_id: CASTER_DISCORD, discord_username: `p2_cast_${TS}` },
      { auth_user_id: playerAuthId, discord_user_id: PLAYER_DISCORD, discord_username: `p2_pl_${TS}` },
    ]);

    // cast_member row pointing at the staff caster
    const { data: cm } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name: `P2 Cast ${TS}`,
        auth_user_id: casterAuthId,
      })
      .select('id')
      .single();
    castMemberId = cm!.id;

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `P2 Tour ${TS}`,
        slug: `p2-tour-${TS}`,
        status: 'published',
        game: 'Overwatch',
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
          name: `P2 Team A ${TS}`,
          slug: `p2-a-${TS}`,
          captain_id: playerAuthId,
        })
        .select('id')
        .single(),
      supabaseTestClient
        .from('teams')
        .insert({
          name: `P2 Team B ${TS}`,
          slug: `p2-b-${TS}`,
          captain_id: adminAuthId,
        })
        .select('id')
        .single(),
    ]);
    teamAId = a!.id;
    teamBId = b!.id;

    const scheduledIn8h = new Date(Date.now() + 8 * 60 * 60_000).toISOString();
    const { data: match } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        status: 'pending',
        round_number: 1,
        team1_id: teamAId,
        team2_id: teamBId,
        match_format: 'bo3',
        scheduled_at: scheduledIn8h,
      })
      .select('id')
      .single();
    matchId = match!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (matchId) {
      await supabaseTestClient
        .from('cast_assignments')
        .delete()
        .eq('match_id', matchId);
      await supabaseTestClient.from('matches').delete().eq('id', matchId);
    }
    if (stageId) {
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
    if (castMemberId) {
      await supabaseTestClient
        .from('cast_members')
        .delete()
        .eq('id', castMemberId);
    }
    for (const tid of [teamAId, teamBId].filter(Boolean)) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', tid);
      await supabaseTestClient.from('teams').delete().eq('id', tid);
    }
    for (const aid of [adminAuthId, casterAuthId, playerAuthId].filter(Boolean)) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .eq('auth_user_id', aid);
    }
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestStaff(CASTER_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(matchId).toBeTruthy();
    expect(castMemberId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* PATCH /matches/[id]  (admin meta)                                         */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot match meta — PATCH /matches/[id]', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: PLAYER_DISCORD,
        lobbyCode: '12345',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('400 si aucun champ fourni', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD },
    });
    expect(res.status()).toBe(400);
  });

  test('400 si streamUrl invalide', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        streamUrl: 'javascript:alert(1)',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('200 happy path : lobby + stream + notes', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        lobbyCode: 'ABCDEF',
        streamUrl: 'https://twitch.tv/owwomenscup',
        notes: 'Map pool A',
      },
    });
    expect(res.status()).toBe(200);

    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('lobby_code, stream_url, notes')
      .eq('id', matchId)
      .single();
    expect(m!.lobby_code).toBe('ABCDEF');
    expect(m!.stream_url).toBe('https://twitch.tv/owwomenscup');
    expect(m!.notes).toBe('Map pool A');
  });

  test('200 null clears the field', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD, notes: null },
    });
    expect(res.status()).toBe(200);

    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('notes')
      .eq('id', matchId)
      .single();
    expect(m!.notes).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* PATCH /players/by-discord/[id]/profile                                    */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot profile — PATCH /players/.../profile', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si on essaie de modifier le profil de quelqu’un d’autre (non admin)', async ({
    request,
  }) => {
    const res = await request.patch(
      `/api/bot/v1/players/by-discord/${PLAYER_DISCORD}/profile`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: CASTER_DISCORD, displayName: 'pwned' },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('400 si battleTag mal formé', async ({ request }) => {
    const res = await request.patch(
      `/api/bot/v1/players/by-discord/${PLAYER_DISCORD}/profile`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: PLAYER_DISCORD, battleTag: 'no-hash' },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('400 si mainRole invalide', async ({ request }) => {
    const res = await request.patch(
      `/api/bot/v1/players/by-discord/${PLAYER_DISCORD}/profile`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: PLAYER_DISCORD, mainRole: 'shotcaller' },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('200 self-service : battleTag + mainRole + rank', async ({ request }) => {
    const res = await request.patch(
      `/api/bot/v1/players/by-discord/${PLAYER_DISCORD}/profile`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: PLAYER_DISCORD,
          battleTag: 'Joueuse#1234',
          mainRole: 'support',
          rank: 'Diamant 2',
        },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.editedBy).toBe('self');

    const { data: u } = await supabaseTestClient!.auth.admin.getUserById(playerAuthId);
    expect(u.user!.user_metadata.battle_tag).toBe('Joueuse#1234');
    expect(u.user!.user_metadata.main_role).toBe('support');
    expect(u.user!.user_metadata.rank).toBe('Diamant 2');
  });

  test('200 admin override sur une autre joueuse', async ({ request }) => {
    const res = await request.patch(
      `/api/bot/v1/players/by-discord/${PLAYER_DISCORD}/profile`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          displayName: 'Renommée par admin',
        },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.editedBy).toBe('staff');
  });
});

/* ------------------------------------------------------------------------- */
/* /matches/[id]/cast  (assign / unassign / list)                            */
/* ------------------------------------------------------------------------- */

let createdAssignmentId: string;

test.describe.serial('Bot cast — POST/GET/DELETE /matches/[id]/cast', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 sur POST si actor non admin', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/matches/${matchId}/cast`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: PLAYER_DISCORD, castMemberId },
    });
    expect(res.status()).toBe(403);
  });

  test('201 POST happy path : assignment créé', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/matches/${matchId}/cast`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD, castMemberId },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.assignment.cast_member_id).toBe(castMemberId);
    createdAssignmentId = body.assignment.id;
  });

  test('409 POST sur doublon', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/matches/${matchId}/cast`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD, castMemberId },
    });
    expect(res.status()).toBe(409);
  });

  test('200 GET retourne l’assignment avec discordUserId du caster', async ({
    request,
  }) => {
    const res = await request.get(`/api/bot/v1/matches/${matchId}/cast`, {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.assignments.length).toBe(1);
    expect(body.assignments[0].castMember.discordUserId).toBe(CASTER_DISCORD);
  });

  test('200 DELETE retire l’assignment', async ({ request }) => {
    const res = await request.delete(`/api/bot/v1/matches/${matchId}/cast`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        assignmentId: createdAssignmentId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(1);
  });

  test('404 DELETE si aucun match', async ({ request }) => {
    const res = await request.delete(`/api/bot/v1/matches/${matchId}/cast`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD, castMemberId },
    });
    expect(res.status()).toBe(404);
  });
});

/* ------------------------------------------------------------------------- */
/* GET /cast/assignments  (windowed list)                                    */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot cast list — GET /cast/assignments', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    // Recreate un assignment pour avoir au moins 1 row dans la liste
    const briefingAt = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
    await supabaseTestClient.from('cast_assignments').insert({
      match_id: matchId,
      cast_member_id: castMemberId,
      briefing_at: briefingAt,
    });
  });

  test('200 inclut l’assignment dans la fenêtre 24h', async ({ request }) => {
    const res = await request.get(`/api/bot/v1/cast/assignments?hours=24`, {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.assignments.find(
      (a: { match: { id: string } | null }) => a.match?.id === matchId
    );
    expect(found).toBeTruthy();
    expect(found.castMember.discordUserId).toBe(CASTER_DISCORD);
  });

  test('200 filtre castMemberId', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/cast/assignments?castMemberId=${castMemberId}&hours=24`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.assignments.length).toBeGreaterThan(0);
  });
});
