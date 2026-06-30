/**
 * Tests E2E — PATCH /api/bot/v1/matches/[matchId]/discord
 *
 * Writeback bot -> site des IDs Discord lies a un match (chantiers Discord-natifs :
 * thread #matchs-live, scheduled event, thread forum dispute). Auth x-api-key
 * uniquement (pas d'actorDiscordUserId : c'est le bot service account qui ecrit).
 *
 *  - 401 sans x-api-key
 *  - 405 sur GET / POST / DELETE
 *  - 400 sur matchId invalide
 *  - 400 sur snowflake invalide
 *  - 400 sur body vide
 *  - 404 si match introuvable
 *  - 200 happy path : persiste les 3 colonnes
 *  - 200 PATCH partiel : ne touche que les champs fournis
 *  - 200 null clear : passer null vide la colonne
 *  - 200 idempotence : le meme PATCH 2x renvoie le meme etat
 */
import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

function snowflake(suffix: number): string {
  // Snowflakes Discord = 15-25 digits. Pad pour rester strict.
  return `${9_000_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const THREAD_ID_1 = snowflake(1);
const THREAD_ID_2 = snowflake(2);
const SCHEDULED_EVENT_ID = snowflake(3);
const DISPUTE_THREAD_ID = snowflake(4);
const MATCH_CHANNEL_ID = snowflake(5);

let tournamentId: string;
let matchId: string;

test.describe.serial('Bot match discord writeback — auth & method', () => {
  test('PATCH sans cle -> 401', async ({ request }) => {
    const res = await request.patch(
      '/api/bot/v1/matches/00000000-0000-0000-0000-000000000000/discord',
      { data: { discordThreadId: THREAD_ID_1 } }
    );
    // L'auth route renvoie 401 (cle absente/invalide) ou 500 si BOT_API_KEY
    // n'est meme pas configure cote serveur.
    expect([401, 500]).toContain(res.status());
  });

  test('GET -> 405', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/matches/00000000-0000-0000-0000-000000000000/discord',
      { headers: { 'x-api-key': API_KEY ?? '' } }
    );
    expect(res.status()).toBe(405);
  });

  test('POST -> 405', async ({ request }) => {
    const res = await request.post(
      '/api/bot/v1/matches/00000000-0000-0000-0000-000000000000/discord',
      { headers: { 'x-api-key': API_KEY ?? '' }, data: {} }
    );
    expect(res.status()).toBe(405);
  });

  test('DELETE -> 405', async ({ request }) => {
    const res = await request.delete(
      '/api/bot/v1/matches/00000000-0000-0000-0000-000000000000/discord',
      { headers: { 'x-api-key': API_KEY ?? '' } }
    );
    expect(res.status()).toBe(405);
  });
});

test.describe
  .serial('Bot match discord writeback — validation & writes', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot Match Discord Tour ${TS}`,
        slug: `bot-match-discord-tour-${TS}`,
        status: 'published',
        game: 'overwatch',
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const { data: m } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        status: 'pending',
        round_name: 'Round 1',
      })
      .select('id')
      .single();
    matchId = m!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (matchId) {
      await supabaseTestClient.from('matches').delete().eq('id', matchId);
    }
    if (tournamentId) {
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    }
  });

  test('400 si matchId pas un UUID', async ({ request }) => {
    const res = await request.patch('/api/bot/v1/matches/not-a-uuid/discord', {
      headers: { 'x-api-key': API_KEY! },
      data: { discordThreadId: THREAD_ID_1 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/matchId/i);
  });

  test('400 si snowflake invalide', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: { discordThreadId: 'pas-un-snowflake' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/discordThreadId/i);
  });

  test('400 si discordMatchChannelId snowflake invalide', async ({
    request,
  }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: { discordMatchChannelId: 'pas-un-snowflake' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/discordMatchChannelId/i);
  });

  // T4 — salon prive par match. Tolere 503 (CHANNEL_COLUMN_MISSING) tant que
  // la migration discord_match_channel_id n'est pas appliquee : degradation
  // gracieuse. Une fois la colonne presente, le champ se comporte comme les 3
  // autres (accepte + clearable).
  test('200/503 discordMatchChannelId : set puis clear', async ({
    request,
  }) => {
    const setRes = await request.patch(
      `/api/bot/v1/matches/${matchId}/discord`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { discordMatchChannelId: MATCH_CHANNEL_ID },
      }
    );
    expect([200, 503]).toContain(setRes.status());
    const setBody = await setRes.json();
    if (setRes.status() === 503) {
      expect(setBody.code).toBe('CHANNEL_COLUMN_MISSING');
      return;
    }
    expect(setBody.success).toBe(true);
    expect(setBody.match.discord_match_channel_id).toBe(MATCH_CHANNEL_ID);

    const clearRes = await request.patch(
      `/api/bot/v1/matches/${matchId}/discord`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { discordMatchChannelId: null },
      }
    );
    expect(clearRes.status()).toBe(200);
    const clearBody = await clearRes.json();
    expect(clearBody.match.discord_match_channel_id).toBeNull();
  });

  test('400 si body vide (aucun champ Discord)', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Aucun champ/i);
  });

  test('404 si match introuvable', async ({ request }) => {
    const res = await request.patch(
      '/api/bot/v1/matches/00000000-0000-0000-0000-000000000000/discord',
      {
        headers: { 'x-api-key': API_KEY! },
        data: { discordThreadId: THREAD_ID_1 },
      }
    );
    expect(res.status()).toBe(404);
  });

  test('200 happy path : persiste les 3 colonnes', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        discordThreadId: THREAD_ID_1,
        discordScheduledEventId: SCHEDULED_EVENT_ID,
        discordDisputeThreadId: DISPUTE_THREAD_ID,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.match).toMatchObject({
      id: matchId,
      discord_thread_id: THREAD_ID_1,
      discord_scheduled_event_id: SCHEDULED_EVENT_ID,
      discord_dispute_thread_id: DISPUTE_THREAD_ID,
    });

    // Confirme cote DB que la persistence a bien eu lieu
    const { data: row } = await supabaseTestClient!
      .from('matches')
      .select(
        'discord_thread_id, discord_scheduled_event_id, discord_dispute_thread_id'
      )
      .eq('id', matchId)
      .single();
    expect(row).toEqual({
      discord_thread_id: THREAD_ID_1,
      discord_scheduled_event_id: SCHEDULED_EVENT_ID,
      discord_dispute_thread_id: DISPUTE_THREAD_ID,
    });
  });

  test('200 PATCH partiel : ne touche que les champs fournis', async ({
    request,
  }) => {
    // Met a jour seulement le thread principal — les 2 autres doivent rester.
    const res = await request.patch(`/api/bot/v1/matches/${matchId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: { discordThreadId: THREAD_ID_2 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.match).toMatchObject({
      discord_thread_id: THREAD_ID_2,
      discord_scheduled_event_id: SCHEDULED_EVENT_ID,
      discord_dispute_thread_id: DISPUTE_THREAD_ID,
    });
  });

  test('200 null clear : passer null vide la colonne', async ({ request }) => {
    const res = await request.patch(`/api/bot/v1/matches/${matchId}/discord`, {
      headers: { 'x-api-key': API_KEY! },
      data: { discordScheduledEventId: null },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.match.discord_scheduled_event_id).toBeNull();
    // Les autres colonnes non touchees
    expect(body.match.discord_thread_id).toBe(THREAD_ID_2);
    expect(body.match.discord_dispute_thread_id).toBe(DISPUTE_THREAD_ID);
  });

  test('200 idempotent : meme PATCH 2x renvoie le meme etat', async ({
    request,
  }) => {
    const payload = { discordDisputeThreadId: DISPUTE_THREAD_ID };
    const first = await request.patch(
      `/api/bot/v1/matches/${matchId}/discord`,
      { headers: { 'x-api-key': API_KEY! }, data: payload }
    );
    const second = await request.patch(
      `/api/bot/v1/matches/${matchId}/discord`,
      { headers: { 'x-api-key': API_KEY! }, data: payload }
    );
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const a = await first.json();
    const b = await second.json();
    // Les colonnes Discord doivent etre identiques entre les 2 calls
    expect(a.match.discord_thread_id).toBe(b.match.discord_thread_id);
    expect(a.match.discord_dispute_thread_id).toBe(
      b.match.discord_dispute_thread_id
    );
    expect(a.match.discord_scheduled_event_id).toBe(
      b.match.discord_scheduled_event_id
    );
  });
});
