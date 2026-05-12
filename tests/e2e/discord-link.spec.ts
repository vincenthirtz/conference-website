/**
 * Tests E2E — Discord link API (status / unlink) + link-discord endpoint
 *
 * Couvre /api/auth/discord-link et /api/auth/link-discord
 *  - 401 sans session
 *  - GET status sans lien → linked: false
 *  - GET status avec lien → renvoie le snowflake
 *  - DELETE supprime le lien
 *  - POST link-discord refuse les users sans identité Discord
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestPlayer,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const PLAYER_EMAIL = `e2e-discord-link-${TS}@test.local`;
const PLAYER_PASSWORD = 'TestPassw0rd!42';
const FAKE_DISCORD_ID = `${3_000_000_000_000_000_000n + BigInt(TS % 1_000_000_000)}`;

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

let playerToken: string | null = null;
let playerAuthId: string;

test.describe.serial('Discord link API', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    const player = await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    playerAuthId = player!.id;
    playerToken = await signIn(PLAYER_EMAIL, PLAYER_PASSWORD);
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', playerAuthId);
    await deleteTestUser(PLAYER_EMAIL);
  });

  /* ---------- /api/auth/discord-link ---------- */

  test('GET sans session renvoie 401', async ({ request }) => {
    const res = await request.get('/api/auth/discord-link');
    expect(res.status()).toBe(401);
  });

  test('GET avec session, aucun lien → linked: false', async ({ request }) => {
    const res = await request.get('/api/auth/discord-link', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.linked).toBe(false);
    expect(body.discordUserId).toBeNull();
  });

  test('GET avec session après seed → linked: true', async ({ request }) => {
    // Seed directement en DB (simule un OAuth Discord réussi).
    await supabaseTestClient!.from('user_discord_links').upsert({
      auth_user_id: playerAuthId,
      discord_user_id: FAKE_DISCORD_ID,
      discord_username: `discord_test_${TS}`,
    });

    const res = await request.get('/api/auth/discord-link', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.linked).toBe(true);
    expect(body.discordUserId).toBe(FAKE_DISCORD_ID);
    expect(body.discordUsername).toBe(`discord_test_${TS}`);
  });

  test('DELETE sans session → 401', async ({ request }) => {
    const res = await request.delete('/api/auth/discord-link');
    expect(res.status()).toBe(401);
  });

  test('DELETE supprime le lien', async ({ request }) => {
    const res = await request.delete('/api/auth/discord-link', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(200);

    const { data } = await supabaseTestClient!
      .from('user_discord_links')
      .select('auth_user_id')
      .eq('auth_user_id', playerAuthId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  /* ---------- /api/auth/link-discord ---------- */

  test('POST link-discord sans session → 401', async ({ request }) => {
    const res = await request.post('/api/auth/link-discord');
    expect(res.status()).toBe(401);
  });

  test('POST link-discord refuse un user sans identité Discord', async ({
    request,
  }) => {
    // Le test player a été créé via createTestPlayer → email/password, pas
    // d'identité Discord attachée. L'endpoint doit retourner 400.
    const res = await request.post('/api/auth/link-discord', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Discord/);
  });
});
