/**
 * Tests E2E — Bot stages & matches creation
 *
 *  POST /api/bot/tournaments/[tournamentId]/stages
 *   - 403 si actor pas admin
 *   - 400 sur name manquant / stage_type invalide
 *   - 201 création + audit log + auto order_index
 *
 *  POST /api/bot/tournaments/[tournamentId]/matches
 *   - 403 si actor pas admin
 *   - 400 sur body sans match/matches
 *   - 400 sur stage_id/team1_id non-UUID
 *   - 400 sur status / bracket_side invalide
 *   - 201 single (avec teams)
 *   - 201 batch sans teams (placeholders)
 *   - 400 sur > 100 matchs
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

function discordId(suffix: number): string {
  return `${9_000_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(0);
const ADMIN_EMAIL = `bot-sm-admin-${TS}@test.local`;

let adminAuthId: string;
let tournamentId: string;
let team1Id: string;
let team2Id: string;
const createdStageIds: string[] = [];
const createdMatchIds: string[] = [];

test.describe.serial('Bot stages & matches', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: adminAuthId,
      discord_user_id: ADMIN_DISCORD,
      discord_username: `admin_bot_sm_${TS}`,
    });

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot SM Tour ${TS}`,
        slug: `bot-sm-tour-${TS}`,
        status: 'published',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `SM Team A ${TS}`,
        slug: `sm-team-a-${TS}`,
      })
      .select('id')
      .single();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `SM Team B ${TS}`,
        slug: `sm-team-b-${TS}`,
      })
      .select('id')
      .single();
    team2Id = t2!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdMatchIds.length > 0) {
      await supabaseTestClient
        .from('matches')
        .delete()
        .in('id', createdMatchIds);
    }
    if (createdStageIds.length > 0) {
      await supabaseTestClient
        .from('tournament_stages')
        .delete()
        .in('id', createdStageIds);
    }
    await supabaseTestClient
      .from('teams')
      .delete()
      .in('id', [team1Id, team2Id]);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    await supabaseTestClient
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', adminAuthId);
    await deleteTestStaff(ADMIN_EMAIL);
  });

  /* ---------- Stages ---------- */

  test('Stage: 403 si actor pas admin (Discord inconnu)', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/stages`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: discordId(99),
          name: 'Should fail',
        },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('Stage: 400 si name manquant', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/stages`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('Stage: 400 si stage_type invalide', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/stages`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          name: 'Bad Type',
          stage_type: 'free_for_all',
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('Stage: 201 avec auto order_index', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/stages`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          name: `Phase 1 ${TS}`,
          stage_type: 'swiss',
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.stage.name).toBe(`Phase 1 ${TS}`);
    expect(body.stage.stage_type).toBe('swiss');
    expect(body.stage.order_index).toBe(0);
    createdStageIds.push(body.stage.id);
  });

  test('Stage: 201 et order_index auto-incrémenté', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/stages`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          name: `Phase 2 ${TS}`,
          stage_type: 'bracket',
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.stage.order_index).toBe(1);
    createdStageIds.push(body.stage.id);

    // Audit log
    const { data: log } = await supabaseTestClient!
      .from('staff_logs')
      .select('payload')
      .eq('entity_id', body.stage.id)
      .eq('action', 'create_stage')
      .maybeSingle();
    expect((log?.payload as { via?: string }).via).toBe('discord_bot');
  });

  /* ---------- Matches ---------- */

  test('Match: 403 si actor pas admin', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/matches`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: discordId(99),
          match: {},
        },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('Match: 400 si pas de match/matches dans le body', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/matches`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('Match: 400 sur status invalide', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/matches`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          match: { status: 'in_progress' },
        },
      }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/status/i);
  });

  test('Match: 400 sur team1_id non-UUID', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/matches`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          match: { team1_id: 'not-a-uuid' },
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('Match: 201 single avec deux teams', async ({ request }) => {
    const scheduledAt = new Date(Date.now() + 3600_000).toISOString();
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/matches`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          match: {
            stage_id: createdStageIds[0],
            team1_id: team1Id,
            team2_id: team2Id,
            scheduled_at: scheduledAt,
            match_format: 'bo3',
            round_name: 'Round 1',
            round_number: 1,
          },
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.matches[0].team1_id).toBe(team1Id);
    expect(body.matches[0].team2_id).toBe(team2Id);
    expect(body.matches[0].status).toBe('pending');
    expect(body.matches[0].round_name).toBe('Round 1');
    createdMatchIds.push(body.matches[0].id);
  });

  test('Match: 201 batch sans teams (placeholders)', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/matches`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          matches: [
            { stage_id: createdStageIds[1], round_name: 'Quart F1' },
            { stage_id: createdStageIds[1], round_name: 'Quart F2' },
            { stage_id: createdStageIds[1], round_name: 'Quart F3' },
          ],
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(3);
    for (const m of body.matches) {
      expect(m.team1_id).toBeNull();
      expect(m.team2_id).toBeNull();
      createdMatchIds.push(m.id);
    }
  });

  test('Match: 400 si > 100 matchs', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/${tournamentId}/matches`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          matches: Array.from({ length: 101 }, () => ({})),
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('Match: 404 si tournoi introuvable', async ({ request }) => {
    const res = await request.post(
      `/api/bot/tournaments/00000000-0000-0000-0000-000000000000/matches`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: ADMIN_DISCORD,
          match: {},
        },
      }
    );
    expect(res.status()).toBe(404);
  });
});
