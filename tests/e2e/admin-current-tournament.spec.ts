/**
 * Tests E2E — Mega-dashboard "Tournoi en cours"
 *
 * Couvre :
 *   - Redirect /admin/tournoi-en-cours (→ login si non auth, → /admin/tournament/<id>/dashboard si auth)
 *   - GET /api/admin/tournament/[id]/dashboard renvoie tournament + summary +
 *     stages + upcomingMatches + alerts + signals + guards (le payload enrichi)
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
const STAFF_EMAIL = `e2e-current-${TS}@test.local`;
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

test.describe.serial('Admin "Tournoi en cours" E2E', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    staffToken = await getStaffAccessToken();

    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Current ${TS}`,
        slug: `e2e-current-${TS}`,
        status: 'running',
        game: 'Overwatch',
        format: 'bo3',
      })
      .select('id')
      .single();
    tournamentId = t!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    await deleteTestStaff(STAFF_EMAIL);
  });

  /* ---------- Redirect entry-point ---------- */

  test('GET /admin/tournoi-en-cours sans session redirige vers /admin/login', async ({
    request,
  }) => {
    const res = await request.get('/admin/tournoi-en-cours', {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect([302, 303, 307, 308]).toContain(res.status());
    const location = res.headers()['location'] || '';
    expect(location).toContain('/admin/login');
  });

  /* ---------- Dashboard API enrichie ---------- */

  test('GET /api/admin/tournament/[id]/dashboard sans auth renvoie 401/403', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/admin/tournament/${tournamentId}/dashboard`
    );
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/tournament/[id]/dashboard renvoie le payload enrichi', async ({
    request,
  }) => {
    expect(staffToken).toBeTruthy();
    const res = await request.get(
      `/api/admin/tournament/${tournamentId}/dashboard`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Champs hérités
    expect(body.tournament.id).toBe(tournamentId);
    expect(body.tournament.format).toBe('bo3');
    expect(body.summary).toMatchObject({
      totalTeams: expect.any(Number),
      totalMatches: expect.any(Number),
      finishedMatches: expect.any(Number),
      completionPercent: expect.any(Number),
    });
    expect(Array.isArray(body.stages)).toBe(true);
    expect(Array.isArray(body.upcomingMatches)).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);

    // Nouveaux champs : signals
    expect(body.signals).toBeTruthy();
    expect(body.signals.disputesOpen).toMatchObject({
      count: expect.any(Number),
      matches: expect.any(Array),
    });
    expect(body.signals.checkinNext24h).toMatchObject({
      upcoming: expect.any(Number),
      bothCheckedIn: expect.any(Number),
      oneSide: expect.any(Number),
      missing: expect.any(Number),
      forfeited: expect.any(Number),
    });
    expect(typeof body.signals.conflictsCount).toBe('number');
    expect(typeof body.signals.pendingTeamsCount).toBe('number');
    expect(body.signals.rosterLockProximity).toMatchObject({
      lockedAt: expect.anything(), // null or string
      hoursLeft: expect.anything(),
      teamsBelowMin: expect.any(Number),
    });
    expect(typeof body.signals.supportHighOpen).toBe('number');
    expect(typeof body.signals.activeMvpPolls).toBe('number');
    expect(Array.isArray(body.signals.stagesReadyToAdvance)).toBe(true);
    expect(Array.isArray(body.signals.liveMatches)).toBe(true);

    // Nouveaux champs : guards
    expect(body.guards.current_status).toBe('running');
    expect(Array.isArray(body.guards.guards)).toBe(true);
    const statuses = body.guards.guards.map((g: any) => g.status);
    expect(statuses).toEqual(
      expect.arrayContaining([
        'draft',
        'published',
        'running',
        'completed',
        'archived',
      ])
    );
  });

  test('dashboard initial sur tournoi vide a tous les compteurs à 0', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/admin/tournament/${tournamentId}/dashboard`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
      }
    );
    const body = await res.json();
    expect(body.signals.disputesOpen.count).toBe(0);
    expect(body.signals.conflictsCount).toBe(0);
    expect(body.signals.liveMatches).toEqual([]);
    expect(body.signals.stagesReadyToAdvance).toEqual([]);
  });

  test('GET avec id non-UUID renvoie 400', async ({ request }) => {
    const res = await request.get(
      '/api/admin/tournament/not-a-uuid/dashboard',
      {
        headers: { Authorization: `Bearer ${staffToken}` },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('GET avec id inconnu renvoie 404', async ({ request }) => {
    const res = await request.get(
      '/api/admin/tournament/00000000-0000-0000-0000-000000000000/dashboard',
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    expect(res.status()).toBe(404);
  });
});
