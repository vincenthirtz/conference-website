/**
 * Tests E2E — Bot Swiss next-round + stage finalize
 *
 *  POST /api/bot/v1/stages/[id]/next-round
 *  POST /api/bot/v1/stages/[id]/finalize
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
  return `${9_900_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(1);
const PLAYER_DISCORD = discordId(2);
const ADMIN_EMAIL = `bot-prog-adm-${TS}@test.local`;
const PLAYER_EMAIL = `bot-prog-pl-${TS}@test.local`;

let adminAuthId: string;
let playerAuthId: string;
let tournamentId: string;
let swissStageId: string;
let bracketStageId: string;
let team1Id: string;
let team2Id: string;
let team3Id: string;
let team4Id: string;
const createdMatchIds: string[] = [];

test.describe.serial('Bot progression — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    const player = await createTestPlayer(PLAYER_EMAIL, 'TestPass123!');
    playerAuthId = player!.id;
    await supabaseTestClient.from('user_discord_links').insert([
      { auth_user_id: adminAuthId, discord_user_id: ADMIN_DISCORD, discord_username: `prog_adm_${TS}` },
      { auth_user_id: playerAuthId, discord_user_id: PLAYER_DISCORD, discord_username: `prog_pl_${TS}` },
    ]);

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Prog Tour ${TS}`,
        slug: `prog-tour-${TS}`,
        status: 'published',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const { data: swissStage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Swiss',
        kind: 'swiss',
        stage_type: 'swiss',
        order_index: 0,
        is_active: true,
        settings: { total_rounds: 3, match_format: 'bo3' },
      })
      .select('id')
      .single();
    swissStageId = swissStage!.id;

    const { data: bracketStage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Bracket',
        kind: 'bracket',
        stage_type: 'bracket',
        order_index: 1,
        is_active: true,
      })
      .select('id')
      .single();
    bracketStageId = bracketStage!.id;

    // 4 teams
    const teams = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        supabaseTestClient!
          .from('teams')
          .insert({
            name: `Prog T${n} ${TS}`,
            slug: `prog-t${n}-${TS}`,
            captain_id: n === 1 ? adminAuthId : playerAuthId,
          })
          .select('id')
          .single()
      )
    );
    [team1Id, team2Id, team3Id, team4Id] = teams.map((r) => r.data!.id);

    // Inscrire toutes les teams dans swissStage
    await supabaseTestClient.from('stage_teams').insert(
      [team1Id, team2Id, team3Id, team4Id].map((tid, idx) => ({
        stage_id: swissStageId,
        team_id: tid,
        seed: idx + 1,
      }))
    );

    // Round 1 : 2 matchs finished (team1 bat team2, team3 bat team4)
    const r1 = await supabaseTestClient
      .from('matches')
      .insert([
        {
          tournament_id: tournamentId,
          stage_id: swissStageId,
          status: 'finished',
          is_bye: false,
          round_number: 1,
          team1_id: team1Id,
          team2_id: team2Id,
          team1_score: 2,
          team2_score: 0,
          winner_team_id: team1Id,
          match_format: 'bo3',
          completed_at: new Date().toISOString(),
        },
        {
          tournament_id: tournamentId,
          stage_id: swissStageId,
          status: 'finished',
          is_bye: false,
          round_number: 1,
          team1_id: team3Id,
          team2_id: team4Id,
          team1_score: 2,
          team2_score: 1,
          winner_team_id: team3Id,
          match_format: 'bo3',
          completed_at: new Date().toISOString(),
        },
      ])
      .select('id');
    for (const m of r1.data ?? []) createdMatchIds.push((m as { id: string }).id);
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdMatchIds.length > 0) {
      await supabaseTestClient.from('matches').delete().in('id', createdMatchIds);
    }
    // Cleanup tout match créé par les tests (rounds générés)
    await supabaseTestClient
      .from('matches')
      .delete()
      .eq('stage_id', swissStageId);
    if (swissStageId) {
      await supabaseTestClient.from('stage_teams').delete().eq('stage_id', swissStageId);
      await supabaseTestClient.from('tournament_stages').delete().eq('id', swissStageId);
    }
    if (bracketStageId) {
      await supabaseTestClient.from('tournament_stages').delete().eq('id', bracketStageId);
    }
    if (tournamentId) {
      await supabaseTestClient.from('tournaments').delete().eq('id', tournamentId);
    }
    for (const tid of [team1Id, team2Id, team3Id, team4Id].filter(Boolean)) {
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
    expect(swissStageId).toBeTruthy();
    expect(team1Id).toBeTruthy();
    expect(createdMatchIds.length).toBe(2);
  });
});

/* ------------------------------------------------------------------------- */
/* /next-round                                                               */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /next-round', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/next-round`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: PLAYER_DISCORD, dryRun: true },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('400 si stage pas swiss', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${bracketStageId}/next-round`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, dryRun: true },
      }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('NOT_SWISS');
  });

  test('200 dry-run : preview round 2 sans insert', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/next-round`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, dryRun: true },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('dry-run');
    expect(body.roundNumber).toBe(2);
    expect(body.preview.length).toBe(2); // 4 teams -> 2 pairings
    expect(body.createdMatchIds).toEqual([]);

    // Vérifie qu'aucun match round 2 n'a été créé
    const { data: r2 } = await supabaseTestClient!
      .from('matches')
      .select('id')
      .eq('stage_id', swissStageId)
      .eq('round_number', 2);
    expect(r2!.length).toBe(0);
  });

  test('201 insert : round 2 créé', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/next-round`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.mode).toBe('inserted');
    expect(body.createdMatchIds.length).toBe(2);

    const { data: r2 } = await supabaseTestClient!
      .from('matches')
      .select('id, round_number, status')
      .eq('stage_id', swissStageId)
      .eq('round_number', 2);
    expect(r2!.length).toBe(2);
    expect(r2![0].status).toBe('pending');
  });

  test('409 ROUND_TOO_SMALL si round déjà existant', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/next-round`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD },
      }
    );
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('ROUND_TOO_SMALL');
  });

  test('400 UNFINISHED_PREVIOUS_ROUND : impossible round 3 tant que round 2 pending', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/next-round`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, roundNumber: 3 },
      }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('UNFINISHED_PREVIOUS_ROUND');
  });
});

/* ------------------------------------------------------------------------- */
/* /finalize                                                                 */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /finalize', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/finalize`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: PLAYER_DISCORD },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('409 ACTIVE_MATCHES_PRESENT (round 2 pending)', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/finalize`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD },
      }
    );
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('ACTIVE_MATCHES_PRESENT');
    expect(body.activeMatchCount).toBe(2);
  });

  test('200 avec force=true bypass le garde', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/finalize`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, force: true },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.stage.is_active).toBe(false);
    expect(body.forced).toBe(true);

    const { data: s } = await supabaseTestClient!
      .from('tournament_stages')
      .select('is_active')
      .eq('id', swissStageId)
      .single();
    expect(s!.is_active).toBe(false);
  });

  test('409 ALREADY_INACTIVE sur seconde tentative', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/stages/${swissStageId}/finalize`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: ADMIN_DISCORD, force: true },
      }
    );
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('ALREADY_INACTIVE');
  });
});
