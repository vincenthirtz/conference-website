import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const PREFIX = `E2E-TNOT-${Date.now()}`;
const STAFF_EMAIL = `test-tnot-staff-${Date.now()}@test.local`;
const CAPTAIN_A_EMAIL = `test-tnot-captA-${Date.now()}@test.local`;
const CAPTAIN_B_EMAIL = `test-tnot-captB-${Date.now()}@test.local`;
const PASSWORD = 'TestPassword123!';

test.describe('Tournament notify captains API', () => {
  let staffToken: string;
  let captainAToken: string;
  let captainAUserId: string;
  let captainBUserId: string;
  let teamAId: string;
  let teamBId: string;
  let tournamentId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [STAFF_EMAIL, CAPTAIN_A_EMAIL, CAPTAIN_B_EMAIL]) {
      await deleteTestStaff(email);
      await deleteTestUser(email);
    }

    // Create staff user (manager)
    await createTestStaff(STAFF_EMAIL, PASSWORD, 'manager');
    const { data: staffAuth } = await supabaseTestClient!.auth.signInWithPassword({
      email: STAFF_EMAIL,
      password: PASSWORD,
    });
    staffToken = staffAuth.session!.access_token;

    // Create captains
    const captainA = await createTestPlayer(CAPTAIN_A_EMAIL, PASSWORD);
    const captainB = await createTestPlayer(CAPTAIN_B_EMAIL, PASSWORD);
    captainAUserId = captainA!.id;
    captainBUserId = captainB!.id;

    const { data: authA } = await supabaseTestClient!.auth.signInWithPassword({
      email: CAPTAIN_A_EMAIL,
      password: PASSWORD,
    });
    captainAToken = authA.session!.access_token;

    // Create teams
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

    // Create a tournament
    const { data: tournament } = await supabaseTestClient!
      .from('tournaments')
      .insert({
        name: `${PREFIX}-Tournament`,
        slug: `${PREFIX.toLowerCase()}-tournament`,
        status: 'published',
        start_date: '2026-05-01T18:00:00Z',
      })
      .select('id')
      .single();
    tournamentId = tournament!.id;
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    // Cleanup messages
    if (teamAId) {
      await supabaseTestClient!.from('demandes').delete().eq('team_id', teamAId).eq('type', 'captain_message');
    }
    if (teamBId) {
      await supabaseTestClient!.from('demandes').delete().eq('team_id', teamBId).eq('type', 'captain_message');
    }
    // Cleanup tournament
    if (tournamentId) {
      await supabaseTestClient!.from('tournament_maps').delete().eq('tournament_id', tournamentId);
      await supabaseTestClient!.from('tournaments').delete().eq('id', tournamentId);
    }
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [STAFF_EMAIL, CAPTAIN_A_EMAIL, CAPTAIN_B_EMAIL]) {
      await deleteTestStaff(email);
      await deleteTestUser(email);
    }
  });

  // ─── Auth / protection ──────────────────────────────

  test('POST returns 401 without token', async ({ request }) => {
    const res = await request.post('/api/admin/tournaments/notify-captains', {
      data: { tournamentId: 'fake' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST returns 401/403 with player token', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/admin/tournaments/notify-captains', {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: { tournamentId },
    });
    expect([401, 403]).toContain(res.status());
  });

  // ─── Validation ─────────────────────────────────────

  test('POST returns 400 with invalid tournamentId', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/admin/tournaments/notify-captains', {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { tournamentId: 'not-a-uuid' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST returns 404 for non-existent tournament', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/admin/tournaments/notify-captains', {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { tournamentId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(404);
  });

  // ─── Successful notification ────────────────────────

  test('Staff notifies all captains about a tournament', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/admin/tournaments/notify-captains', {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { tournamentId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.notified).toBeGreaterThanOrEqual(2);
    expect(body.messagesSent).toBeGreaterThanOrEqual(2);
  });

  test('Captain A has a system message about the tournament', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    // Check demandes for team A
    const { data } = await supabaseTestClient!
      .from('demandes')
      .select('*')
      .eq('team_id', teamAId)
      .eq('type', 'captain_message')
      .eq('source', 'system')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(data).toBeTruthy();
    expect(data!.comment).toContain(`${PREFIX}-Tournament`);
    expect(data!.comment).toContain('ouvert aux inscriptions');
    expect((data!.payload as any).notification_type).toBe('tournament_open');
    expect((data!.payload as any).tournament_id).toBe(tournamentId);
    expect((data!.payload as any).from_team_name).toBe("OW Women's Cup");
  });

  test('Captain B also has a system message', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const { data } = await supabaseTestClient!
      .from('demandes')
      .select('*')
      .eq('team_id', teamBId)
      .eq('type', 'captain_message')
      .eq('source', 'system')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(data).toBeTruthy();
    expect(data!.comment).toContain(`${PREFIX}-Tournament`);
  });

  test('GET /api/player/messages shows system conversation for captain A', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // The system message should appear in conversations
    const systemConv = (body.conversations || []).find(
      (c: { otherTeamName: string }) => c.otherTeamName === "OW Women's Cup"
    );
    expect(systemConv).toBeTruthy();
    expect(systemConv.unreadCount).toBeGreaterThanOrEqual(1);
  });
});
