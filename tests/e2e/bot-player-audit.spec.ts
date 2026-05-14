/**
 * Tests E2E — Bot player audit trail
 *
 *  GET /api/bot/v1/players/by-discord/[id]/actions
 *
 * Couvre :
 *  - log emis sur une action joueuse (leave_team) -> apparait dans /actions
 *  - self-service ok : actor == target Discord
 *  - 403 si actor != target et actor pas admin
 *  - staff admin peut lire le log de n'importe quelle joueuse
 *  - filtre role='target' renvoie les rows ou la joueuse est CIBLEE
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
  return `${1_200_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(1);
const CAPTAIN_DISCORD = discordId(2);
const MEMBER_DISCORD = discordId(3);
const ADMIN_EMAIL = `audit-adm-${TS}@test.local`;
const CAPTAIN_EMAIL = `audit-cap-${TS}@test.local`;
const MEMBER_EMAIL = `audit-mem-${TS}@test.local`;

let adminAuthId: string;
let captainAuthId: string;
let memberAuthId: string;
let teamId: string;
const createdRowIds: number[] = [];

test.describe.serial('Bot player audit — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    const cap = await createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!');
    captainAuthId = cap!.id;
    const mem = await createTestPlayer(MEMBER_EMAIL, 'TestPass123!');
    memberAuthId = mem!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      {
        auth_user_id: adminAuthId,
        discord_user_id: ADMIN_DISCORD,
        discord_username: `audit_adm_${TS}`,
      },
      {
        auth_user_id: captainAuthId,
        discord_user_id: CAPTAIN_DISCORD,
        discord_username: `audit_cap_${TS}`,
      },
      {
        auth_user_id: memberAuthId,
        discord_user_id: MEMBER_DISCORD,
        discord_username: `audit_mem_${TS}`,
      },
    ]);

    const { data: t } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Audit Team ${TS}`,
        slug: `audit-team-${TS}`,
        captain_id: captainAuthId,
      })
      .select('id')
      .single();
    teamId = t!.id;

    await supabaseTestClient.from('team_members').insert([
      { team_id: teamId, user_id: captainAuthId, role: 'captain' },
      { team_id: teamId, user_id: memberAuthId, role: 'player' },
    ]);
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdRowIds.length > 0) {
      await supabaseTestClient
        .from('bot_player_actions')
        .delete()
        .in('id', createdRowIds);
    }
    // Cleanup audit rows referencing test users (in case some weren't tracked)
    for (const aid of [adminAuthId, captainAuthId, memberAuthId].filter(Boolean)) {
      await supabaseTestClient
        .from('bot_player_actions')
        .delete()
        .or(
          `actor_auth_user_id.eq.${aid},target_auth_user_id.eq.${aid}`
        );
    }
    if (teamId) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', teamId);
      await supabaseTestClient.from('teams').delete().eq('id', teamId);
    }
    for (const aid of [adminAuthId, captainAuthId, memberAuthId].filter(Boolean)) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .eq('auth_user_id', aid);
    }
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestUser(CAPTAIN_EMAIL);
    await deleteTestUser(MEMBER_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(teamId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* Génère une action via /kicker (POST DELETE members) → log capté            */
/* ------------------------------------------------------------------------- */

test.describe.serial('Audit log capture', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('Le kick produit une row dans bot_player_actions', async ({ request }) => {
    const res = await request.delete(`/api/bot/v1/teams/${teamId}/members`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: CAPTAIN_DISCORD,
        targetDiscordUserId: MEMBER_DISCORD,
      },
    });
    expect(res.status()).toBe(200);

    // Petite latence : logPlayerAction est fire-and-forget. On lit la DB
    // jusqu'à ce que la row apparaisse (max ~2s).
    let row: { id: number } | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await supabaseTestClient!
        .from('bot_player_actions')
        .select('id')
        .eq('action', 'kick_member')
        .eq('actor_auth_user_id', captainAuthId)
        .eq('target_auth_user_id', memberAuthId)
        .maybeSingle();
      if (data) {
        row = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(row).toBeTruthy();
    if (row) createdRowIds.push(row.id);
  });
});

/* ------------------------------------------------------------------------- */
/* GET /players/.../actions                                                   */
/* ------------------------------------------------------------------------- */

test.describe.serial('Audit GET endpoint', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('400 sans actorDiscordUserId', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${CAPTAIN_DISCORD}/actions`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });

  test('403 si actor != target et pas staff', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${CAPTAIN_DISCORD}/actions?actorDiscordUserId=${MEMBER_DISCORD}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(403);
  });

  test('200 self-service : capitaine voit son propre log (kick émis)', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${CAPTAIN_DISCORD}/actions?actorDiscordUserId=${CAPTAIN_DISCORD}&action=kick_member`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accessedAs).toBe('self');
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].action).toBe('kick_member');
    expect(body.items[0].actor.isSelf).toBe(true);
  });

  test('200 admin staff lit le log de n’importe qui', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${MEMBER_DISCORD}/actions?actorDiscordUserId=${ADMIN_DISCORD}&role=target`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accessedAs).toBe('staff');
    // role=target -> on cherche les rows où MEMBER est la cible → le kick
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].target?.isSelf).toBe(true);
    expect(body.items[0].action).toBe('kick_member');
  });

  test('400 si role invalide', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${CAPTAIN_DISCORD}/actions?actorDiscordUserId=${CAPTAIN_DISCORD}&role=foo`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });
});
