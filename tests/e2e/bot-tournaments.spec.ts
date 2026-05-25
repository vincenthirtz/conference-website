/**
 * Tests E2E — /api/bot/v1/tournaments
 *
 *  - Auth + method check
 *  - GET filtre les drafts par défaut, accepte ?status=, ?includeDrafts=1
 *  - POST 403 si actor Discord pas lié à un staff admin/owner
 *  - POST 201 si actor lié à un admin (entrée staff_logs avec via: discord_bot)
 *  - POST 409 sur slug doublon
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
  return `${7_000_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const ADMIN_DISCORD = discordId(0);
const PLAYER_DISCORD = discordId(1);
const ADMIN_EMAIL = `bot-tour-admin-${TS}@test.local`;
const PLAYER_EMAIL = `bot-tour-player-${TS}@test.local`;

let adminAuthId: string;
let playerAuthId: string;
let publishedTournamentId: string;
let draftTournamentId: string;
const createdTournamentIds: string[] = [];

test.describe.serial('Bot tournaments — auth & method', () => {
  test('rejette sans x-api-key', async ({ request }) => {
    const res = await request.get('/api/bot/v1/tournaments');
    expect([401, 500]).toContain(res.status());
  });

  test('rejette avec mauvaise x-api-key', async ({ request }) => {
    const res = await request.get('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': 'wrong' },
    });
    expect([401, 500]).toContain(res.status());
  });

  test('refuse PUT', async ({ request }) => {
    const res = await request.fetch('/api/bot/v1/tournaments', {
      method: 'PUT',
      headers: { 'x-api-key': API_KEY ?? '' },
    });
    expect(res.status()).toBe(405);
  });
});

test.describe.serial('Bot tournaments — GET (list)', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    const { data: pub } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot Tour Pub ${TS}`,
        slug: `bot-tour-pub-${TS}`,
        status: 'published',
        game: 'overwatch',
      })
      .select('id')
      .single();
    publishedTournamentId = pub!.id;
    createdTournamentIds.push(publishedTournamentId);

    const { data: dr } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot Tour Draft ${TS}`,
        slug: `bot-tour-draft-${TS}`,
        status: 'draft',
        game: 'overwatch',
      })
      .select('id')
      .single();
    draftTournamentId = dr!.id;
    createdTournamentIds.push(draftTournamentId);
  });

  test('GET cache les drafts par défaut', async ({ request }) => {
    const res = await request.get('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = body.tournaments.map((t: { id: string }) => t.id);
    expect(ids).toContain(publishedTournamentId);
    expect(ids).not.toContain(draftTournamentId);
  });

  test('GET ?includeDrafts=1 inclut les drafts', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/tournaments?includeDrafts=1&limit=100',
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = body.tournaments.map((t: { id: string }) => t.id);
    expect(ids).toContain(draftTournamentId);
  });

  test('GET ?status=draft renvoie uniquement les drafts', async ({
    request,
  }) => {
    const res = await request.get('/api/bot/v1/tournaments?status=draft', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const t of body.tournaments) {
      expect(t.status).toBe('draft');
    }
  });

  test('GET ?status=invalid → 400', async ({ request }) => {
    const res = await request.get('/api/bot/v1/tournaments?status=notastatus', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe.serial('Bot tournaments — POST (create)', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Staff admin lié Discord
    const admin = await createTestStaff(ADMIN_EMAIL, 'TestPass123!', 'admin');
    adminAuthId = admin!.id;
    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: adminAuthId,
      discord_user_id: ADMIN_DISCORD,
      discord_username: 'admin_bot_test',
    });

    // Joueur lié Discord (pas staff)
    const player = await createTestPlayer(PLAYER_EMAIL, 'TestPass123!');
    playerAuthId = player!.id;
    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: playerAuthId,
      discord_user_id: PLAYER_DISCORD,
      discord_username: 'player_bot_test',
    });
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdTournamentIds.length > 0) {
      await supabaseTestClient
        .from('tournament_maps')
        .delete()
        .in('tournament_id', createdTournamentIds);
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .in('id', createdTournamentIds);
    }
    await supabaseTestClient
      .from('user_discord_links')
      .delete()
      .in('auth_user_id', [adminAuthId, playerAuthId]);
    await deleteTestStaff(ADMIN_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('POST rejette actorDiscordUserId manquant', async ({ request }) => {
    const res = await request.post('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': API_KEY! },
      data: { name: `Whatever ${TS}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/actorDiscordUserId/);
  });

  test('POST 403 si actor non lié à un staff admin', async ({ request }) => {
    const res = await request.post('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: PLAYER_DISCORD,
        name: `Should fail ${TS}`,
      },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin|owner/i);
  });

  test('POST 403 si Discord inconnu (pas lié)', async ({ request }) => {
    const res = await request.post('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: discordId(99),
        name: `Should fail ${TS}`,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('POST 400 si name manquant', async ({ request }) => {
    const res = await request.post('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: ADMIN_DISCORD },
    });
    expect(res.status()).toBe(400);
  });

  test('POST 201 par un admin', async ({ request }) => {
    const name = `Bot Created ${TS}`;
    const res = await request.post('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        name,
        game: 'overwatch',
        status: 'upcoming',
        max_teams: 16,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.tournament.name).toBe(name);
    expect(body.tournament.status).toBe('upcoming');
    expect(body.tournament.max_teams).toBe(16);
    expect(body.tournament.slug).toMatch(/^bot-created-\d+$/);
    createdTournamentIds.push(body.tournament.id);

    // Le staff log inclut via: discord_bot
    const { data: log } = await supabaseTestClient!
      .from('staff_logs')
      .select('action, payload')
      .eq('entity_id', body.tournament.id)
      .eq('action', 'create_tournament')
      .maybeSingle();
    expect(log).toBeTruthy();
    expect((log!.payload as { via?: string }).via).toBe('discord_bot');
  });

  test('POST 409 sur slug doublon', async ({ request }) => {
    const res = await request.post('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        name: `Bot Created ${TS}`, // même slug que le précédent
      },
    });
    expect(res.status()).toBe(409);
  });

  test('POST 400 sur dates invalides', async ({ request }) => {
    const res = await request.post('/api/bot/v1/tournaments', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: ADMIN_DISCORD,
        name: `Bot dates ${TS}`,
        start_date: '2026-12-01',
        end_date: '2026-11-01', // avant start
      },
    });
    expect(res.status()).toBe(400);
  });
});
