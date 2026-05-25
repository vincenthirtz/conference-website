/**
 * Tests E2E — Check-in flow public (GET/POST /api/checkin/[token])
 *
 * Couvre :
 *   - 400 sur token manquant
 *   - 404 sur token invalide
 *   - GET retourne les infos du match (resolveCheckinToken)
 *   - POST coche le team1_checked_in_at / team2_checked_in_at
 *   - Idempotence : re-POST renvoie alreadyCheckedIn=true
 *   - Refus si match en statut autre que pending/ongoing
 */
import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

let tournamentId: string;
let team1Id: string;
let team2Id: string;
let pendingMatchId: string;
let cancelledMatchId: string;
let team1Token: string;
let team2Token: string;
let cancelledToken: string;

function randomToken(prefix: string) {
  return `e2e-${prefix}-${TS}-${Math.random().toString(36).slice(2, 10)}`;
}

test.describe.serial('Check-in flow E2E', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Checkin ${TS}`,
        slug: `e2e-checkin-${TS}`,
        status: 'running',
        game: 'overwatch',
      })
      .select('id')
      .single();
    tournamentId = t!.id;

    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Chk A ${TS}`, slug: `e2e-chk-a-${TS}` })
      .select('id')
      .single();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Chk B ${TS}`, slug: `e2e-chk-b-${TS}` })
      .select('id')
      .single();
    team2Id = t2!.id;

    team1Token = randomToken('t1');
    team2Token = randomToken('t2');
    cancelledToken = randomToken('cancel');

    const { data: m } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'pending',
        team1_checkin_token: team1Token,
        team2_checkin_token: team2Token,
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    pendingMatchId = m!.id;

    const { data: m2 } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'cancelled',
        team1_checkin_token: cancelledToken,
      })
      .select('id')
      .single();
    cancelledMatchId = m2!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient
      .from('matches')
      .delete()
      .in('id', [pendingMatchId, cancelledMatchId]);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    await supabaseTestClient
      .from('teams')
      .delete()
      .in('id', [team1Id, team2Id]);
  });

  /* ---------- Mauvaises requêtes ---------- */

  test('GET sans token (URL malformée) renvoie 404 sur token introuvable', async ({
    request,
  }) => {
    const res = await request.get('/api/checkin/zzzzzzzz-not-real');
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Token (introuvable|invalide)/);
  });

  test('GET avec token totalement invalide renvoie 404', async ({
    request,
  }) => {
    const res = await request.get('/api/checkin/totally-fake-token');
    expect(res.status()).toBe(404);
  });

  test('PUT (méthode non autorisée) renvoie 405', async ({ request }) => {
    const res = await request.fetch(`/api/checkin/${team1Token}`, {
      method: 'PUT',
    });
    expect(res.status()).toBe(405);
  });

  /* ---------- GET resolveToken ---------- */

  test('GET retourne les infos du match pour le team1', async ({ request }) => {
    const res = await request.get(`/api/checkin/${team1Token}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.matchId).toBe(pendingMatchId);
    expect(body.teamSlot).toBe(1);
    expect(body.teamId).toBe(team1Id);
    expect(body.teamName).toContain('E2E Chk A');
    expect(body.opponentName).toContain('E2E Chk B');
    expect(body.tournamentName).toContain('E2E Checkin');
    expect(body.alreadyCheckedIn).toBe(false);
    expect(body.matchStatus).toBe('pending');
  });

  test('GET pour le team2 inverse les rôles team/opponent', async ({
    request,
  }) => {
    const res = await request.get(`/api/checkin/${team2Token}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.teamSlot).toBe(2);
    expect(body.teamId).toBe(team2Id);
    expect(body.teamName).toContain('E2E Chk B');
    expect(body.opponentName).toContain('E2E Chk A');
  });

  /* ---------- POST redeem ---------- */

  test('POST sur un match cancelled refuse le check-in', async ({
    request,
  }) => {
    const res = await request.post(`/api/checkin/${cancelledToken}`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Check-in fermé/);
  });

  test('POST coche le team1_checked_in_at', async ({ request }) => {
    const res = await request.post(`/api/checkin/${team1Token}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.matchId).toBe(pendingMatchId);
    expect(body.teamSlot).toBe(1);
    expect(body.alreadyCheckedIn).toBe(false);
    expect(body.checkedInAt).toBeTruthy();

    // DB sanity check
    const { data: m } = await supabaseTestClient!
      .from('matches')
      .select('team1_checked_in_at, team2_checked_in_at')
      .eq('id', pendingMatchId)
      .maybeSingle();
    expect(m!.team1_checked_in_at).toBeTruthy();
    expect(m!.team2_checked_in_at).toBeNull();
  });

  test('POST idempotent : re-redeem renvoie alreadyCheckedIn=true', async ({
    request,
  }) => {
    const res = await request.post(`/api/checkin/${team1Token}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyCheckedIn).toBe(true);
  });

  test('GET après redeem signale alreadyCheckedIn=true', async ({
    request,
  }) => {
    const res = await request.get(`/api/checkin/${team1Token}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.alreadyCheckedIn).toBe(true);
    expect(body.checkedInAt).toBeTruthy();
  });
});
