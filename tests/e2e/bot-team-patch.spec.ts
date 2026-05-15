/**
 * Tests E2E — PATCH /api/bot/v1/teams/[teamId]
 *
 * Vérifie que /modifier-equipe (capitaine) peut mettre à jour son équipe
 * via l'API bot. Garde rosterLock-free intentionnellement : un capitaine
 * peut rename son équipe même si elle est en tournoi (le lock concerne le
 * roster, pas les infos descriptives).
 *
 * Auth chain : x-api-key → requireBotPlayer(actorDiscordUserId) → check
 * captain_id == actor.authUserId.
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
  return `${8_500_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const CAPTAIN_DISCORD = discordId(11);
const MEMBER_DISCORD = discordId(12);

const CAPTAIN_EMAIL = `bot-patch-cap-${TS}@test.local`;
const MEMBER_EMAIL = `bot-patch-mem-${TS}@test.local`;

let captainAuthId: string;
let memberAuthId: string;
let teamId: string;

test.describe.serial('PATCH /api/bot/v1/teams/[teamId]', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const [captain, member] = await Promise.all([
      createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!'),
      createTestPlayer(MEMBER_EMAIL, 'TestPass123!'),
    ]);
    captainAuthId = captain!.id;
    memberAuthId = member!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      {
        auth_user_id: captainAuthId,
        discord_user_id: CAPTAIN_DISCORD,
        discord_username: `pcap_${TS}`,
      },
      {
        auth_user_id: memberAuthId,
        discord_user_id: MEMBER_DISCORD,
        discord_username: `pmem_${TS}`,
      },
    ]);

    const { data: t } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Bot Patch Team ${TS}`,
        slug: `bot-patch-team-${TS}`,
        captain_id: captainAuthId,
        is_active: true,
        description: 'Initial description',
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
    if (teamId) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', teamId);
      await supabaseTestClient.from('teams').delete().eq('id', teamId);
    }
    const ids = [captainAuthId, memberAuthId].filter(Boolean);
    if (ids.length > 0) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .in('auth_user_id', ids);
    }
    await Promise.all([
      deleteTestUser(CAPTAIN_EMAIL),
      deleteTestUser(MEMBER_EMAIL),
    ]);
  });

  test('401 sans clé', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamId}`, {
      data: { actorDiscordUserId: CAPTAIN_DISCORD, name: 'X' },
    });
    expect(res.status()).toBe(401);
  });

  test('400 si aucun champ modifiable fourni', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: CAPTAIN_DISCORD },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/Aucun champ modifiable/);
  });

  test('403 si membre non-capitaine tente le PATCH', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: MEMBER_DISCORD, name: 'Hack' },
    });
    expect(res.status()).toBe(403);
  });

  test('400 si name trop court', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: CAPTAIN_DISCORD, name: 'A' },
    });
    expect(res.status()).toBe(400);
  });

  test('200 happy path : capitaine update name + description', async ({
    request,
  }) => {
    const newName = `Bot Patch Team Updated ${TS}`;
    const newDesc = 'Updated description via bot test';
    const res = await request.patch(`/api/bot/v1/teams/${teamId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: CAPTAIN_DISCORD,
        name: newName,
        description: newDesc,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.team.name).toBe(newName);
    expect(body.team.description).toBe(newDesc);

    // Vérifie aussi en DB que c'est bien persisté.
    if (supabaseTestClient) {
      const { data } = await supabaseTestClient
        .from('teams')
        .select('name, description')
        .eq('id', teamId)
        .single();
      expect(data?.name).toBe(newName);
      expect(data?.description).toBe(newDesc);
    }
  });

  test('200 + description="" → description=null en DB', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: CAPTAIN_DISCORD, description: '' },
    });
    expect(res.status()).toBe(200);
    if (supabaseTestClient) {
      const { data } = await supabaseTestClient
        .from('teams')
        .select('description')
        .eq('id', teamId)
        .single();
      expect(data?.description).toBeNull();
    }
  });

  test('400 si website pas en http(s)', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/teams/${teamId}`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: CAPTAIN_DISCORD,
        website: 'javascript:alert(1)',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('200 GET still works after PATCH support added', async ({ request }) => {
    const res = await request.get(`/api/bot/v1/teams/${teamId}`, {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).team.id).toBe(teamId);
  });
});
