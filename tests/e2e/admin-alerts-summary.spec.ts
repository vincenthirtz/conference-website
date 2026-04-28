/**
 * Tests E2E — /api/admin/alerts-summary (badge navbar)
 *
 * Couvre :
 *   - 401/403 sans auth
 *   - 400 sur tournament_id non-UUID
 *   - 200 sur tournoi explicite : payload {tournamentId, total, breakdown}
 *   - 200 sur fallback (pas de tournament_id) : auto-resolve via DEFAULT_CURRENT_TOURNAMENT_ID
 *     ou plus récent en running ; total cohérent avec le breakdown
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
const STAFF_EMAIL = `e2e-alerts-${TS}@test.local`;
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

test.describe.serial('Admin alerts summary E2E', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    staffToken = await getStaffAccessToken();

    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Alerts ${TS}`,
        slug: `e2e-alerts-${TS}`,
        status: 'running',
        game: 'Overwatch',
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

  test('GET sans auth renvoie 401/403', async ({ request }) => {
    const res = await request.get('/api/admin/alerts-summary');
    expect([401, 403]).toContain(res.status());
  });

  test('GET avec tournament_id non-UUID renvoie 400', async ({ request }) => {
    const res = await request.get(
      '/api/admin/alerts-summary?tournament_id=not-a-uuid',
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    expect(res.status()).toBe(400);
  });

  test('GET avec tournament_id valide renvoie tournamentId + total + breakdown', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/admin/alerts-summary?tournament_id=${tournamentId}`,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tournamentId).toBe(tournamentId);
    expect(typeof body.total).toBe('number');
    expect(body.breakdown).toMatchObject({
      disputes: expect.any(Number),
      conflicts: expect.any(Number),
      supportHigh: expect.any(Number),
      pendingTeams: expect.any(Number),
      checkinMissing: expect.any(Number),
      stagesReady: expect.any(Number),
      activeMvpPolls: expect.any(Number),
      rosterLockSoon: expect.any(Boolean),
    });
  });

  test('le total correspond à la somme du breakdown (modulo le boolean rosterLock)', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/admin/alerts-summary?tournament_id=${tournamentId}`,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    const body = await res.json();
    const expected =
      body.breakdown.disputes +
      body.breakdown.conflicts +
      body.breakdown.supportHigh +
      body.breakdown.pendingTeams +
      body.breakdown.checkinMissing +
      (body.breakdown.rosterLockSoon ? 1 : 0) +
      body.breakdown.stagesReady +
      body.breakdown.activeMvpPolls;
    expect(body.total).toBe(expected);
  });

  test('GET sans tournament_id auto-résout (status 200)', async ({
    request,
  }) => {
    const res = await request.get('/api/admin/alerts-summary', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Either it resolves a real tournament id, or null if no candidate exists.
    expect(typeof body.total).toBe('number');
    if (body.tournamentId) {
      expect(body.tournamentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    } else {
      expect(body.total).toBe(0);
    }
  });
});
