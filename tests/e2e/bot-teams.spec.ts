/**
 * Tests E2E — Bot team creation & tournament registration
 *
 *  POST /api/bot/v1/teams
 *   - auth + method
 *   - validation (name, captainDiscordUserId)
 *   - 404 si capitaine non lié
 *   - 201 happy path + team_members row insérée
 *   - 409 sur slug doublon
 *
 *  POST /api/bot/v1/tournaments/[tournamentId]/teams
 *   - 403 sans actor admin
 *   - 400 sur tournament non publié
 *   - 201 happy path avec stage + audit log
 *   - 409 sur double registration
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
  return `${8_000_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const CAPTAIN_DISCORD = discordId(0);
const ADMIN_DISCORD = discordId(1);
const CAPTAIN_EMAIL = `bot-team-captain-${TS}@test.local`;
const ADMIN_EMAIL = `bot-team-admin-${TS}@test.local`;

let captainAuthId: string;
let adminAuthId: string;
const createdTeamIds: string[] = [];
let publishedTournamentId: string;
let publishedStageId: string;
let draftTournamentId: string;

test.describe.serial('Bot teams — auth & method', () => {
  test('POST sans clé → 401/500', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams', { data: { name: 'x' } });
    expect([401, 500]).toContain(res.status());
  });

  test('GET → 405', async ({ request }) => {
    const res = await request.get('/api/bot/v1/teams', {
      headers: { 'x-api-key': API_KEY ?? '' },
    });
    expect(res.status()).toBe(405);
  });
});

test.describe.serial('Bot teams — POST création', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    const captain = await createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!');
    captainAuthId = captain!.id;
    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: captainAuthId,
      discord_user_id: CAPTAIN_DISCORD,
      discord_username: `captain_bot_${TS}`,
    });
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdTeamIds.length > 0) {
      await supabaseTestClient
        .from('team_members')
        .delete()
        .in('team_id', createdTeamIds);
      await supabaseTestClient
        .from('teams')
        .delete()
        .in('id', createdTeamIds);
    }
    await supabaseTestClient
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', captainAuthId);
    await deleteTestUser(CAPTAIN_EMAIL);
  });

  test('400 si name manquant', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams', {
      headers: { 'x-api-key': API_KEY! },
      data: { captainDiscordUserId: CAPTAIN_DISCORD },
    });
    expect(res.status()).toBe(400);
  });

  test('400 si captainDiscordUserId manquant', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams', {
      headers: { 'x-api-key': API_KEY! },
      data: { name: `Team ${TS}` },
    });
    expect(res.status()).toBe(400);
  });

  test('404 si captain Discord pas lié', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        name: `Team Unlinked ${TS}`,
        captainDiscordUserId: discordId(99),
      },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/lié|link/i);
  });

  test('201 happy path : team + team_member capitaine', async ({ request }) => {
    const name = `Bot Created Team ${TS}`;
    const res = await request.post('/api/bot/v1/teams', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        name,
        captainDiscordUserId: CAPTAIN_DISCORD,
        shortName: 'BCT',
        description: 'Équipe créée par le bot',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.team.name).toBe(name);
    expect(body.team.captain_id).toBe(captainAuthId);
    expect(body.team.slug).toMatch(/^bot-created-team-\d+$/);
    createdTeamIds.push(body.team.id);

    // team_members contient le capitaine
    const { data: members } = await supabaseTestClient!
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', body.team.id);
    expect(members?.length).toBe(1);
    expect(members![0].user_id).toBe(captainAuthId);
    expect(members![0].role).toBe('captain');
  });

  test('409 sur slug doublon', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        name: `Bot Created Team ${TS}`, // même slug
        captainDiscordUserId: CAPTAIN_DISCORD,
      },
    });
    expect(res.status()).toBe(409);
  });
});

test.describe.serial('Bot tournament registration', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Admin lié Discord
    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: adminAuthId,
      discord_user_id: ADMIN_DISCORD,
      discord_username: `admin_bot_${TS}`,
    });

    // Tournoi published + 1 stage
    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot Reg Tour ${TS}`,
        slug: `bot-reg-tour-${TS}`,
        status: 'published',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    publishedTournamentId = tour!.id;

    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: publishedTournamentId,
        name: 'Phase 1',
        kind: 'swiss',
        order_index: 0,
      })
      .select('id')
      .single();
    publishedStageId = stage!.id;

    // Tournoi en draft (pour test "non published")
    const { data: draft } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot Reg Draft ${TS}`,
        slug: `bot-reg-draft-${TS}`,
        status: 'draft',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    draftTournamentId = draft!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient
      .from('stage_teams')
      .delete()
      .eq('stage_id', publishedStageId);
    await supabaseTestClient
      .from('tournament_stages')
      .delete()
      .eq('id', publishedStageId);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .in('id', [publishedTournamentId, draftTournamentId]);
    await supabaseTestClient
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', adminAuthId);
    await deleteTestStaff(ADMIN_EMAIL);
  });

  test('403 si actor ni admin ni capitaine de la team ciblée', async ({
    request,
  }) => {
    // Discord ID en format valide mais non lie au site -> ni staff ni captain.
    const res = await request.post(
      `/api/bot/v1/tournaments/${publishedTournamentId}/teams`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: discordId(50),
          teamId: createdTeamIds[0],
        },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('400 si actor non lié', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${publishedTournamentId}/teams`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { teamId: createdTeamIds[0] },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('400 si tournoi pas publié', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${draftTournamentId}/teams`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          teamId: createdTeamIds[0],
        },
      }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/published/i);
  });

  test('201 happy path : team inscrite à toutes les phases', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${publishedTournamentId}/teams`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          teamId: createdTeamIds[0],
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stageIds).toContain(publishedStageId);

    // DB : stage_teams contient bien la row
    const { data: row } = await supabaseTestClient!
      .from('stage_teams')
      .select('team_id, stage_id')
      .eq('stage_id', publishedStageId)
      .eq('team_id', createdTeamIds[0])
      .maybeSingle();
    expect(row).toBeTruthy();

    // Audit log via=discord_bot
    const { data: log } = await supabaseTestClient!
      .from('staff_logs')
      .select('payload')
      .eq('entity_id', createdTeamIds[0])
      .eq('tournament_id', publishedTournamentId)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(log && log[0]).toBeTruthy();
    expect((log![0].payload as { via?: string }).via).toBe('discord_bot');
  });

  test('409 sur double registration', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${publishedTournamentId}/teams`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          teamId: createdTeamIds[0],
        },
      }
    );
    expect(res.status()).toBe(409);
  });
});
