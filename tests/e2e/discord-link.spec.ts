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
import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { loginPlayer } from './_helpers/playerSession';
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

// /api/auth/discord-link et /api/auth/link-discord lisent la session dans les
// COOKIES (getServerClient, @supabase/ssr) — c'est ainsi que le site les
// appelle. Un `Authorization: Bearer` n'y est pas lu : la spec l'envoyait et
// recevait 401. On se connecte donc par le vrai formulaire /login dans un
// contexte dédié, et `playerApi` partage ses cookies.
let playerContext: BrowserContext;
let playerApi: APIRequestContext;
let playerAuthId: string;

test.describe('Discord link API', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async ({ browser }) => {
    if (!supabaseTestClient) return;
    const player = await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    playerAuthId = player!.id;
    const { baseURL, storageState } = test.info().project.use;
    playerContext = await browser.newContext({ baseURL, storageState });
    const page = await playerContext.newPage();
    await loginPlayer(page, PLAYER_EMAIL, '/player', PLAYER_PASSWORD);
    await page.close();
    playerApi = playerContext.request;
  });

  test.afterAll(async () => {
    await playerContext?.close();
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

  test('GET avec session, aucun lien → linked: false', async () => {
    const res = await playerApi.get('/api/auth/discord-link');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.linked).toBe(false);
    expect(body.discordUserId).toBeNull();
  });

  test('GET avec session après seed → linked: true', async () => {
    // Seed directement en DB (simule un OAuth Discord réussi).
    await supabaseTestClient!.from('user_discord_links').upsert({
      auth_user_id: playerAuthId,
      discord_user_id: FAKE_DISCORD_ID,
      discord_username: `discord_test_${TS}`,
    });

    const res = await playerApi.get('/api/auth/discord-link');
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

  test('DELETE supprime le lien', async () => {
    const res = await playerApi.delete('/api/auth/discord-link');
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

  test('POST link-discord refuse un user sans identité Discord', async () => {
    // Le test player a été créé via createTestPlayer → email/password, pas
    // d'identité Discord attachée. L'endpoint doit retourner 400.
    const res = await playerApi.post('/api/auth/link-discord');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Discord/);
  });
});
