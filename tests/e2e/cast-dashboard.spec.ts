/**
 * Tests E2E — Caster dashboard read endpoint (GET /api/cast/[matchId])
 *
 * Couvre :
 *   - 401/403 sans auth ou avec rôle insuffisant
 *   - 400 sur matchId non-UUID
 *   - 404 sur match introuvable
 *   - 200 avec match + tournament + veto + rosters + h2h
 *   - 405 sur méthodes autres que GET
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
  createTestPlayer,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const CASTER_EMAIL = `e2e-cast-${TS}@test.local`;
const PLAYER_EMAIL = `e2e-cast-player-${TS}@test.local`;
const PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getAccessToken(email: string): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

let casterToken: string | null = null;
let playerToken: string | null = null;
let tournamentId: string;
let team1Id: string;
let team2Id: string;
let matchId: string;

test.describe.serial('Cast dashboard E2E', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await createTestStaff(CASTER_EMAIL, PASSWORD, 'caster');
    casterToken = await getAccessToken(CASTER_EMAIL);

    await createTestPlayer(PLAYER_EMAIL, PASSWORD);
    playerToken = await getAccessToken(PLAYER_EMAIL);

    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Cast ${TS}`,
        slug: `e2e-cast-${TS}`,
        status: 'running',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    tournamentId = t!.id;

    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Cast A ${TS}`, slug: `e2e-cast-a-${TS}` })
      .select('id')
      .single();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Cast B ${TS}`, slug: `e2e-cast-b-${TS}` })
      .select('id')
      .single();
    team2Id = t2!.id;

    const { data: m } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'pending',
        match_format: 'bo3',
        lobby_code: 'CAST42',
        stream_url: 'https://twitch.tv/cast-test',
      })
      .select('id')
      .single();
    matchId = m!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient
      .from('matches')
      .delete()
      .eq('tournament_id', tournamentId);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    await supabaseTestClient
      .from('teams')
      .delete()
      .in('id', [team1Id, team2Id]);
    await deleteTestStaff(CASTER_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);
  });

  /* ---------- Auth ---------- */

  test('GET sans auth renvoie 401/403', async ({ request }) => {
    const res = await request.get(`/api/cast/${matchId}`);
    expect([401, 403]).toContain(res.status());
  });

  test('GET avec un rôle player (non staff) renvoie 401/403', async ({
    request,
  }) => {
    expect(playerToken).toBeTruthy();
    const res = await request.get(`/api/cast/${matchId}`, {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect([401, 403]).toContain(res.status());
  });

  /* ---------- Validation ---------- */

  test('GET avec matchId non-UUID renvoie 400', async ({ request }) => {
    const res = await request.get('/api/cast/not-a-uuid', {
      headers: { Authorization: `Bearer ${casterToken}` },
    });
    expect(res.status()).toBe(400);
  });

  test('GET avec matchId UUID inconnu renvoie 404', async ({ request }) => {
    const res = await request.get(
      '/api/cast/00000000-0000-0000-0000-000000000000',
      {
        headers: { Authorization: `Bearer ${casterToken}` },
      }
    );
    expect(res.status()).toBe(404);
  });

  test('POST renvoie 405 (méthode non autorisée)', async ({ request }) => {
    const res = await request.post(`/api/cast/${matchId}`, {
      headers: { Authorization: `Bearer ${casterToken}` },
    });
    expect(res.status()).toBe(405);
  });

  /* ---------- Happy path ---------- */

  test('GET retourne match + teams + tournament + veto + rosters + h2h', async ({
    request,
  }) => {
    expect(casterToken).toBeTruthy();
    const res = await request.get(`/api/cast/${matchId}`, {
      headers: { Authorization: `Bearer ${casterToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    // Match info (response uses camelCase)
    expect(body.match.id).toBe(matchId);
    expect(body.match.status).toBe('pending');
    expect(body.match.matchFormat).toBe('bo3');
    expect(body.match.lobbyCode).toBe('CAST42');
    expect(body.match.streamUrl).toContain('cast-test');

    // Teams nested with members
    expect(body.team1.id).toBe(team1Id);
    expect(body.team1.name).toContain('E2E Cast A');
    expect(Array.isArray(body.team1.members)).toBe(true);
    expect(body.team2.id).toBe(team2Id);
    expect(body.team2.name).toContain('E2E Cast B');
    expect(Array.isArray(body.team2.members)).toBe(true);

    // Tournament
    expect(body.tournament.id).toBe(tournamentId);
    expect(body.tournament.name).toContain('E2E Cast');

    // Veto: empty steps for a fresh match, but flow + format must be present
    expect(body.veto).toBeTruthy();
    expect(body.veto.format).toBe('bo3');
    expect(Array.isArray(body.veto.flow)).toBe(true);
    expect(Array.isArray(body.veto.steps)).toBe(true);
    expect(body.veto.isComplete).toBe(false);

    // H2H: zero history for a brand new pairing
    expect(body.h2h.total).toBe(0);
    expect(body.h2h.winsTeam1).toBe(0);
    expect(body.h2h.winsTeam2).toBe(0);
    expect(Array.isArray(body.h2h.meetings)).toBe(true);
  });
});
