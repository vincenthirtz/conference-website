/**
 * Tests E2E — Autocomplete stages + cast-members
 *
 *  GET /api/bot/v1/autocomplete/stages?tournamentId=&q=
 *  GET /api/bot/v1/autocomplete/cast-members?q=
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

const CASTER_EMAIL = `bot-ac-extra-cast-${TS}@test.local`;

let casterAuthId: string;
let castMemberId: string;
let tournamentId: string;
let stage1Id: string;
let stage2Id: string;

test.describe.serial('Bot AC extra — setup', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const caster = await createTestStaff(CASTER_EMAIL, 'TestPass123!', 'caster');
    casterAuthId = caster!.id;

    const { data: cm } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name: `Casterzzz Extra ${TS}`,
        auth_user_id: casterAuthId,
      })
      .select('id')
      .single();
    castMemberId = cm!.id;

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `AC Extra Tour ${TS}`,
        slug: `ac-extra-tour-${TS}`,
        status: 'published',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const [{ data: s1 }, { data: s2 }] = await Promise.all([
      supabaseTestClient
        .from('tournament_stages')
        .insert({
          tournament_id: tournamentId,
          name: `Swiss Alpha ${TS}`,
          slug: `swiss-alpha-${TS}`,
          kind: 'swiss',
          stage_type: 'swiss',
          order_index: 0,
        })
        .select('id')
        .single(),
      supabaseTestClient
        .from('tournament_stages')
        .insert({
          tournament_id: tournamentId,
          name: `Bracket Final ${TS}`,
          slug: `bracket-final-${TS}`,
          kind: 'bracket',
          stage_type: 'bracket',
          order_index: 1,
        })
        .select('id')
        .single(),
    ]);
    stage1Id = s1!.id;
    stage2Id = s2!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    for (const id of [stage1Id, stage2Id].filter(Boolean)) {
      await supabaseTestClient.from('tournament_stages').delete().eq('id', id);
    }
    if (tournamentId) {
      await supabaseTestClient.from('tournaments').delete().eq('id', tournamentId);
    }
    if (castMemberId) {
      await supabaseTestClient.from('cast_members').delete().eq('id', castMemberId);
    }
    await deleteTestStaff(CASTER_EMAIL);
  });

  test('fixtures prêtes', async () => {
    expect(tournamentId).toBeTruthy();
    expect(stage1Id).toBeTruthy();
    expect(castMemberId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* /autocomplete/stages                                                      */
/* ------------------------------------------------------------------------- */

test.describe.serial('AC stages', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('200 vide sans tournamentId', async ({ request }) => {
    const res = await request.get('/api/bot/v1/autocomplete/stages', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  test('400 si tournamentId pas un UUID', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/autocomplete/stages?tournamentId=not-a-uuid',
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });

  test('200 retourne les 2 stages dans l’ordre order_index', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bot/v1/autocomplete/stages?tournamentId=${tournamentId}`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBe(2);
    expect(body.results[0].value).toBe(stage1Id);
    expect(body.results[0].label).toContain('Swiss');
    expect(body.results[1].value).toBe(stage2Id);
  });

  test('200 filtre par q (substring)', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/autocomplete/stages?tournamentId=${tournamentId}&q=Final`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBe(1);
    expect(body.results[0].value).toBe(stage2Id);
  });
});

/* ------------------------------------------------------------------------- */
/* /autocomplete/cast-members                                                */
/* ------------------------------------------------------------------------- */

test.describe.serial('AC cast-members', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('200 trouve le cast member par substring', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/autocomplete/cast-members?q=Casterzzz`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.results.find(
      (r: { value: string }) => r.value === castMemberId
    );
    expect(found).toBeTruthy();
    expect(found.label).toContain('Casterzzz');
  });
});
