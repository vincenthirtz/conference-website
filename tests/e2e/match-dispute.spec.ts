/**
 * Tests E2E — Workflow de dispute sur un match
 *
 * Couvre les 3 verbes du POST /PATCH /DELETE /api/admin/matches/[matchId]/dispute :
 *   - POST   : ouvrir une dispute (status -> 'disputed')
 *   - PATCH  : résoudre (avec ou sans override de score)
 *   - DELETE : annuler (revert vers status précédent)
 *   - 401/403 sans auth
 *   - 409 si déjà disputed / 409 si non disputed à la résolution
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const STAFF_EMAIL = `e2e-dispute-${TS}@test.local`;
const STAFF_PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getStaffAccessToken(): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

let staffToken: string | null = null;
let tournamentId: string;
let team1Id: string;
let team2Id: string;
let matchId: string;

test.describe.serial('Match dispute workflow E2E', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    staffToken = await getStaffAccessToken();

    // Tournoi + 2 équipes + 1 match en pending
    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Dispute ${TS}`,
        slug: `e2e-dispute-${TS}`,
        status: 'running',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    tournamentId = t!.id;

    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Disp A ${TS}`, slug: `e2e-disp-a-${TS}` })
      .select('id')
      .single();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({ name: `E2E Disp B ${TS}`, slug: `e2e-disp-b-${TS}` })
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
    await deleteTestStaff(STAFF_EMAIL);
  });

  /* ---------- Auth ---------- */

  test('POST sans auth renvoie 401/403', async ({ request }) => {
    const res = await request.post(`/api/admin/matches/${matchId}/dispute`, {
      data: { reason: 'test' },
    });
    expect([401, 403]).toContain(res.status());
  });

  /* ---------- Validation matchId ---------- */

  test('POST avec matchId non-UUID renvoie 400', async ({ request }) => {
    const res = await request.post('/api/admin/matches/not-a-uuid/dispute', {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { reason: 'test' },
    });
    expect(res.status()).toBe(400);
  });

  /* ---------- POST : ouvrir ---------- */

  test('POST sans reason renvoie 400', async ({ request }) => {
    const res = await request.post(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reason is required/);
  });

  test('POST ouvre la dispute et passe le status à "disputed"', async ({
    request,
  }) => {
    const res = await request.post(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { reason: 'Conflit de score signalé par les deux équipes' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.match.status).toBe('disputed');
    expect(body.match.dispute_reason).toBe(
      'Conflit de score signalé par les deux équipes'
    );
    expect(body.match.dispute_opened_at).toBeTruthy();
  });

  test('POST sur un match déjà disputed renvoie 409 ALREADY_DISPUTED', async ({
    request,
  }) => {
    const res = await request.post(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { reason: 'redondante' },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('ALREADY_DISPUTED');
  });

  /* ---------- PATCH : résoudre ---------- */

  test('PATCH sans resolution renvoie 400', async ({ request }) => {
    const res = await request.patch(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/resolution is required/);
  });

  test('PATCH avec resumeStatus invalide renvoie 400', async ({ request }) => {
    const res = await request.patch(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: {
        resolution: 'OK',
        resumeStatus: 'flying',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('PATCH résout sans changement de score (resumeStatus=pending)', async ({
    request,
  }) => {
    const res = await request.patch(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: {
        resolution: 'Faux signalement, on reprend en pending.',
        resumeStatus: 'pending',
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.match.status).toBe('pending');
    expect(body.match.dispute_resolution).toMatch(/Faux signalement/);
    expect(body.match.dispute_resolved_at).toBeTruthy();
  });

  test('PATCH sur un match non disputed renvoie 409 NOT_DISPUTED', async ({
    request,
  }) => {
    const res = await request.patch(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { resolution: 'tentative' },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('NOT_DISPUTED');
  });

  /* ---------- DELETE : annuler ---------- */

  test('DELETE sur un match non disputed renvoie 409 NOT_DISPUTED', async ({
    request,
  }) => {
    const res = await request.delete(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('NOT_DISPUTED');
  });

  test('DELETE annule une dispute fraîche et nettoie les champs', async ({
    request,
  }) => {
    // Re-ouvre une dispute pour pouvoir l'annuler
    await request.post(`/api/admin/matches/${matchId}/dispute`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { reason: 'À annuler ensuite' },
    });

    const res = await request.delete(
      `/api/admin/matches/${matchId}/dispute?resumeStatus=pending`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.match.status).toBe('pending');
    expect(body.match.dispute_reason).toBeNull();
    expect(body.match.dispute_opened_at).toBeNull();
    expect(body.match.dispute_resolution).toBeNull();
  });
});
