/**
 * Tests E2E — Bot user registration (POST /api/bot/register-user)
 *
 * Couvre auth + validations + happy paths (player + staff role) + rollback
 * sur lien Discord déjà utilisé.
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

const createdEmails: string[] = [];
const createdAuthIds: string[] = [];

function discordId(suffix: number): string {
  return `${6_000_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

test.describe.serial('Bot register-user — auth & validation', () => {
  test('rejette sans x-api-key', async ({ request }) => {
    const res = await request.post('/api/bot/register-user', {
      data: { email: `x-${TS}@test.local`, discordUserId: discordId(0) },
    });
    expect([401, 500]).toContain(res.status());
  });

  test('rejette avec mauvaise x-api-key', async ({ request }) => {
    const res = await request.post('/api/bot/register-user', {
      headers: { 'x-api-key': 'wrong' },
      data: { email: `x-${TS}@test.local`, discordUserId: discordId(1) },
    });
    expect([401, 500]).toContain(res.status());
  });

  test('refuse les méthodes autres que POST', async ({ request }) => {
    const res = await request.get('/api/bot/register-user', {
      headers: { 'x-api-key': API_KEY ?? '' },
    });
    expect(res.status()).toBe(405);
  });

  test.describe.serial('Validation (requires BOT_API_KEY)', () => {
    test.skip(!HAS_KEY, 'BOT_API_KEY manquant');

    test('rejette un email invalide', async ({ request }) => {
      const res = await request.post('/api/bot/register-user', {
        headers: { 'x-api-key': API_KEY! },
        data: { email: 'not-an-email', discordUserId: discordId(2) },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Email/);
    });

    test('rejette un discordUserId invalide', async ({ request }) => {
      const res = await request.post('/api/bot/register-user', {
        headers: { 'x-api-key': API_KEY! },
        data: {
          email: `x-${TS}-bad-id@test.local`,
          discordUserId: 'nope',
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/discordUserId/);
    });

    test('rejette le rôle owner', async ({ request }) => {
      const res = await request.post('/api/bot/register-user', {
        headers: { 'x-api-key': API_KEY! },
        data: {
          email: `x-${TS}-owner@test.local`,
          discordUserId: discordId(3),
          role: 'owner',
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/owner/);
    });

    test('rejette un rôle inconnu', async ({ request }) => {
      const res = await request.post('/api/bot/register-user', {
        headers: { 'x-api-key': API_KEY! },
        data: {
          email: `x-${TS}-badrole@test.local`,
          discordUserId: discordId(4),
          role: 'superuser',
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Rôle invalide/);
    });
  });
});

/* ---------- Happy paths ---------- */

test.describe.serial('Bot register-user — création', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdAuthIds.length > 0) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .in('auth_user_id', createdAuthIds);
      await supabaseTestClient
        .from('staff')
        .delete()
        .in('auth_user_id', createdAuthIds);
    }
    for (const email of createdEmails) {
      await deleteTestUser(email);
    }
  });

  test('crée un joueur lié Discord (role=player par défaut)', async ({
    request,
  }) => {
    const email = `bot-reg-player-${TS}@test.local`;
    const dId = discordId(10);
    const res = await request.post('/api/bot/register-user', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        email,
        discordUserId: dId,
        discordUsername: 'alice_player',
        displayName: 'Alice Player',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.authUserId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.role).toBe('player');
    expect(body.discordUserId).toBe(dId);

    createdEmails.push(email);
    createdAuthIds.push(body.authUserId);

    // DB: user_discord_links contient bien la ligne.
    const { data: link } = await supabaseTestClient!
      .from('user_discord_links')
      .select('discord_user_id, discord_username')
      .eq('auth_user_id', body.authUserId)
      .maybeSingle();
    expect(link!.discord_user_id).toBe(dId);
    expect(link!.discord_username).toBe('alice_player');

    // DB: pas de ligne staff pour un player.
    const { data: staffRow } = await supabaseTestClient!
      .from('staff')
      .select('auth_user_id')
      .eq('auth_user_id', body.authUserId)
      .maybeSingle();
    expect(staffRow).toBeNull();
  });

  test('crée un caster (rôle staff) avec entrée dans staff', async ({
    request,
  }) => {
    const email = `bot-reg-caster-${TS}@test.local`;
    const dId = discordId(11);
    const res = await request.post('/api/bot/register-user', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        email,
        discordUserId: dId,
        discordUsername: 'bob_caster',
        displayName: 'Bob Caster',
        role: 'caster',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.role).toBe('caster');

    createdEmails.push(email);
    createdAuthIds.push(body.authUserId);

    // DB: ligne staff existe avec le bon rôle.
    const { data: staffRow } = await supabaseTestClient!
      .from('staff')
      .select('role, email, display_name')
      .eq('auth_user_id', body.authUserId)
      .maybeSingle();
    expect(staffRow!.role).toBe('caster');
    expect(staffRow!.email).toBe(email);
    expect(staffRow!.display_name).toBe('Bob Caster');
  });

  test('409 si l’identité Discord est déjà liée', async ({ request }) => {
    // Réutilise le Discord ID du test "player" (déjà lié).
    const dId = discordId(10);
    const res = await request.post('/api/bot/register-user', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        email: `bot-reg-dupe-${TS}@test.local`,
        discordUserId: dId,
        discordUsername: 'dupe',
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Discord/);
    expect(typeof body.existingAuthUserId).toBe('string');
  });

  test('409 si l’email est déjà utilisé', async ({ request }) => {
    // Réutilise l'email du test "player".
    const dId = discordId(20);
    const res = await request.post('/api/bot/register-user', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        email: `bot-reg-player-${TS}@test.local`,
        discordUserId: dId,
        discordUsername: 'dupe-email',
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Email/);
  });
});
