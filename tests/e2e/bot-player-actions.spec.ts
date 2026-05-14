/**
 * Tests E2E — Audit trail player actions
 *
 *  Vérifie que :
 *   - les actions player (leave_team) écrivent une row dans bot_player_actions
 *   - GET /api/bot/v1/player-actions renvoie ces rows (staff only)
 *   - filtres actor / target / action / since fonctionnent
 *   - non-staff = 403
 *
 * Pré-requis migration : add_bot_player_actions_table.sql
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
  return `${1_100_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(1);
const PLAYER_DISCORD = discordId(2);
const CAPTAIN_DISCORD = discordId(3);
const ADMIN_EMAIL = `pa-adm-${TS}@test.local`;
const PLAYER_EMAIL = `pa-pl-${TS}@test.local`;
const CAPTAIN_EMAIL = `pa-cap-${TS}@test.local`;

let adminAuthId: string;
let playerAuthId: string;
let captainAuthId: string;
let teamId: string;

test.describe.serial('Player actions audit — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    const player = await createTestPlayer(PLAYER_EMAIL, 'TestPass123!');
    playerAuthId = player!.id;
    const captain = await createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!');
    captainAuthId = captain!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      {
        auth_user_id: adminAuthId,
        discord_user_id: ADMIN_DISCORD,
        discord_username: `pa_adm_${TS}`,
      },
      {
        auth_user_id: playerAuthId,
        discord_user_id: PLAYER_DISCORD,
        discord_username: `pa_pl_${TS}`,
      },
      {
        auth_user_id: captainAuthId,
        discord_user_id: CAPTAIN_DISCORD,
        discord_username: `pa_cap_${TS}`,
      },
    ]);

    // Team : captain + player. Player va leave pour générer une action.
    const { data: t } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `PA Team ${TS}`,
        slug: `pa-team-${TS}`,
        captain_id: captainAuthId,
      })
      .select('id')
      .single();
    teamId = t!.id;

    await supabaseTestClient.from('team_members').insert([
      { team_id: teamId, user_id: captainAuthId, role: 'captain' },
      { team_id: teamId, user_id: playerAuthId, role: 'player' },
    ]);
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (teamId) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', teamId);
      await supabaseTestClient.from('teams').delete().eq('id', teamId);
    }
    for (const aid of [adminAuthId, playerAuthId, captainAuthId].filter(Boolean)) {
      await supabaseTestClient
        .from('bot_player_actions')
        .delete()
        .eq('actor_auth_user_id', aid);
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .eq('auth_user_id', aid);
    }
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);
    await deleteTestUser(CAPTAIN_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(teamId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* leave_team produit une row dans bot_player_actions                        */
/* ------------------------------------------------------------------------- */

test.describe.serial('Audit row écrite sur action player', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('POST /teams/leave écrit action=leave_team', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams/leave', {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: PLAYER_DISCORD },
    });
    expect(res.status()).toBe(200);

    // Le helper logPlayerAction est fire-and-forget — petit délai pour
    // laisser l'insert async se faire.
    await new Promise((r) => setTimeout(r, 500));

    const { data: rows } = await supabaseTestClient!
      .from('bot_player_actions')
      .select('action, entity_type, entity_id')
      .eq('actor_auth_user_id', playerAuthId)
      .eq('action', 'leave_team');
    expect((rows ?? []).length).toBeGreaterThan(0);
    expect((rows ?? [])[0].entity_type).toBe('team');
    expect((rows ?? [])[0].entity_id).toBe(teamId);
  });
});

/* ------------------------------------------------------------------------- */
/* GET /player-actions                                                       */
/* ------------------------------------------------------------------------- */

test.describe.serial('GET /player-actions', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor non admin', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/player-actions?staffDiscordUserId=${PLAYER_DISCORD}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(403);
  });

  test('400 si filterActorDiscordUserId mal formé', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/player-actions?staffDiscordUserId=${ADMIN_DISCORD}&filterActorDiscordUserId=abc`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });

  test('200 retourne le leave_team', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/player-actions?staffDiscordUserId=${ADMIN_DISCORD}&filterActorDiscordUserId=${PLAYER_DISCORD}&action=leave_team`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.count).toBeGreaterThan(0);
    expect(body.actions[0].action).toBe('leave_team');
    expect(body.actions[0].actor.discordUserId).toBe(PLAYER_DISCORD);
    expect(body.actions[0].entityId).toBe(teamId);
  });

  test('200 filter since dans le futur → 0', async ({ request }) => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await request.get(
      `/api/bot/v1/player-actions?staffDiscordUserId=${ADMIN_DISCORD}&since=${encodeURIComponent(future)}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
  });
});
