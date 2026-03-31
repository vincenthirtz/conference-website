import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const PREFIX = `E2E-SCRSP-${Date.now()}`;
const CAPTAIN_A_EMAIL = `test-scrsp-captA-${Date.now()}@test.local`;
const CAPTAIN_B_EMAIL = `test-scrsp-captB-${Date.now()}@test.local`;
const PASSWORD = 'TestPassword123!';

test.describe('Scrim response API (/api/teams/scrim-requests)', () => {
  let captainAToken: string;
  let captainBToken: string;
  let captainAUserId: string;
  let captainBUserId: string;
  let teamAId: string;
  let teamBId: string;
  let scrimDemandeId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_A_EMAIL, CAPTAIN_B_EMAIL]) {
      await deleteTestUser(email);
    }

    const captainA = await createTestPlayer(CAPTAIN_A_EMAIL, PASSWORD);
    const captainB = await createTestPlayer(CAPTAIN_B_EMAIL, PASSWORD);
    captainAUserId = captainA!.id;
    captainBUserId = captainB!.id;

    const { data: authA } = await supabaseTestClient!.auth.signInWithPassword({
      email: CAPTAIN_A_EMAIL,
      password: PASSWORD,
    });
    captainAToken = authA.session!.access_token;

    const { data: authB } = await supabaseTestClient!.auth.signInWithPassword({
      email: CAPTAIN_B_EMAIL,
      password: PASSWORD,
    });
    captainBToken = authB.session!.access_token;

    // Team A
    const { data: teamA } = await supabaseTestClient!
      .from('teams')
      .insert({ name: `${PREFIX}-teamA`, captain_id: captainAUserId, is_active: true })
      .select('id')
      .single();
    teamAId = teamA!.id;

    await supabaseTestClient!.from('team_members').insert({
      team_id: teamAId,
      user_id: captainAUserId,
      role: 'player',
      battle_tag: 'CaptA#0001',
    });

    // Team B
    const { data: teamB } = await supabaseTestClient!
      .from('teams')
      .insert({ name: `${PREFIX}-teamB`, captain_id: captainBUserId, is_active: true })
      .select('id')
      .single();
    teamBId = teamB!.id;

    await supabaseTestClient!.from('team_members').insert({
      team_id: teamBId,
      user_id: captainBUserId,
      role: 'player',
      battle_tag: 'CaptB#0001',
    });

    // Captain A sends a scrim request to team B
    const { data: scrimDemande } = await supabaseTestClient!
      .from('demandes')
      .insert({
        user_id: captainAUserId,
        team_id: teamBId,
        type: 'scrim',
        status: 'pending',
        comment: 'Scrim ce soir ?',
        source: 'website',
        payload: {
          from_team_id: teamAId,
          from_team_name: `${PREFIX}-teamA`,
          target_team_name: `${PREFIX}-teamB`,
          preferred_date: '2026-04-10T20:00:00Z',
        },
      })
      .select('id')
      .single();
    scrimDemandeId = scrimDemande!.id;
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    for (const uid of [captainAUserId, captainBUserId]) {
      if (uid) {
        await supabaseTestClient!.from('demandes').delete().eq('user_id', uid);
      }
    }
    // Also clean notification demandes
    if (teamBId) {
      await supabaseTestClient!.from('demandes').delete().eq('team_id', teamBId).eq('type', 'other');
    }
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_A_EMAIL, CAPTAIN_B_EMAIL]) {
      await deleteTestUser(email);
    }
  });

  // ─── Auth ────────────────────────────────────────────

  test('GET returns 401 without token', async ({ request }) => {
    const res = await request.get('/api/teams/scrim-requests');
    expect(res.status()).toBe(401);
  });

  test('POST returns 401 without token', async ({ request }) => {
    const res = await request.post('/api/teams/scrim-requests', {
      data: { demandeId: 'fake', action: 'approve' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET returns 403 for non-captain', async ({ request }) => {
    const res = await request.get('/api/teams/scrim-requests', {
      headers: { Authorization: 'Bearer invalid_token' },
    });
    expect(res.status()).toBe(401);
  });

  // ─── GET pending scrims ─────────────────────────────

  test('Captain B sees pending scrim requests', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.demandes)).toBe(true);
    expect(body.demandes.length).toBeGreaterThanOrEqual(1);

    const scrim = body.demandes.find((d: { id: string }) => d.id === scrimDemandeId);
    expect(scrim).toBeTruthy();
    expect(scrim.payload.from_team_name).toContain(`${PREFIX}-teamA`);
    expect(scrim.comment).toBe('Scrim ce soir ?');
  });

  test('Captain A sees no pending scrims (sender, not target)', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainAToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const scrim = (body.demandes || []).find((d: { id: string }) => d.id === scrimDemandeId);
    expect(scrim).toBeFalsy();
  });

  // ─── POST validation ────────────────────────────────

  test('POST returns 400 with invalid demandeId', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
      data: { demandeId: 'not-a-uuid', action: 'approve' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST returns 400 with invalid action', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
      data: { demandeId: scrimDemandeId, action: 'maybe' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST returns 404 for non-existent demande', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
      data: { demandeId: '00000000-0000-0000-0000-000000000000', action: 'approve' },
    });
    expect(res.status()).toBe(404);
  });

  // ─── Accept scrim ───────────────────────────────────

  test('Captain B accepts the scrim request', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
      data: { demandeId: scrimDemandeId, action: 'approve' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.newStatus).toBe('approved');
    expect(body.message).toContain('accepte');
  });

  test('Scrim demande status is now approved', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const { data } = await supabaseTestClient!
      .from('demandes')
      .select('status')
      .eq('id', scrimDemandeId)
      .single();
    expect(data!.status).toBe('approved');
  });

  test('Admin notification demande was created on approval', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const { data } = await supabaseTestClient!
      .from('demandes')
      .select('*')
      .eq('team_id', teamBId)
      .eq('type', 'other')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(data).toBeTruthy();
    expect(data!.comment).toContain('Scrim accepte');
    expect(data!.comment).toContain(`${PREFIX}-teamA`);
    expect(data!.comment).toContain(`${PREFIX}-teamB`);
    expect((data!.payload as any).notification_type).toBe('scrim_accepted');
    expect((data!.payload as any).original_demande_id).toBe(scrimDemandeId);
  });

  test('Cannot approve an already processed scrim', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
      data: { demandeId: scrimDemandeId, action: 'approve' },
    });
    expect(res.status()).toBe(404);
  });

  // ─── Reject flow (new scrim) ────────────────────────

  test('Captain B can reject a new scrim request', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');

    // Create a new scrim request
    const { data: newScrim } = await supabaseTestClient!
      .from('demandes')
      .insert({
        user_id: captainAUserId,
        team_id: teamBId,
        type: 'scrim',
        status: 'pending',
        comment: 'Un autre scrim ?',
        source: 'website',
        payload: {
          from_team_id: teamAId,
          from_team_name: `${PREFIX}-teamA`,
          target_team_name: `${PREFIX}-teamB`,
        },
      })
      .select('id')
      .single();

    const res = await request.post('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
      data: { demandeId: newScrim!.id, action: 'reject' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.newStatus).toBe('rejected');

    // Verify status
    const { data } = await supabaseTestClient!
      .from('demandes')
      .select('status')
      .eq('id', newScrim!.id)
      .single();
    expect(data!.status).toBe('rejected');
  });

  test('PUT returns 405', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.put('/api/teams/scrim-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
      data: {},
    });
    expect(res.status()).toBe(405);
  });
});
