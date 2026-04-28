import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const PREFIX = `E2E-SCRIM-${Date.now()}`;
const CAPTAIN_EMAIL = `test-scrim-captain-${Date.now()}@test.local`;
const CAPTAIN2_EMAIL = `test-scrim-captain2-${Date.now()}@test.local`;
const PLAYER_EMAIL = `test-scrim-player-${Date.now()}@test.local`;
const PASSWORD = 'TestPassword123!';

test.describe('Scrim requests API (/api/demandes/scrim)', () => {
  let captainToken: string;
  let captain2Token: string;
  let playerToken: string;
  let captainUserId: string;
  let captain2UserId: string;
  let playerUserId: string;
  let teamAId: string;
  let teamBId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    // Cleanup
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_EMAIL, CAPTAIN2_EMAIL, PLAYER_EMAIL]) {
      await deleteTestUser(email);
    }

    // Create test users
    const captain = await createTestPlayer(CAPTAIN_EMAIL, PASSWORD);
    const captain2 = await createTestPlayer(CAPTAIN2_EMAIL, PASSWORD);
    const player = await createTestPlayer(PLAYER_EMAIL, PASSWORD);
    captainUserId = captain!.id;
    captain2UserId = captain2!.id;
    playerUserId = player!.id;

    // Sign in to get tokens
    const { data: captainAuth } =
      await supabaseTestClient!.auth.signInWithPassword({
        email: CAPTAIN_EMAIL,
        password: PASSWORD,
      });
    captainToken = captainAuth.session!.access_token;

    const { data: captain2Auth } =
      await supabaseTestClient!.auth.signInWithPassword({
        email: CAPTAIN2_EMAIL,
        password: PASSWORD,
      });
    captain2Token = captain2Auth.session!.access_token;

    const { data: playerAuth } =
      await supabaseTestClient!.auth.signInWithPassword({
        email: PLAYER_EMAIL,
        password: PASSWORD,
      });
    playerToken = playerAuth.session!.access_token;

    // Create team A with captain
    const { data: teamA } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: `${PREFIX}-teamA`,
        captain_id: captainUserId,
        is_active: true,
      })
      .select('id')
      .single();
    teamAId = teamA!.id;

    await supabaseTestClient!.from('team_members').insert({
      team_id: teamAId,
      user_id: captainUserId,
      role: 'player',
      battle_tag: 'CaptainA#0001',
    });

    // Create team B with captain2
    const { data: teamB } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: `${PREFIX}-teamB`,
        captain_id: captain2UserId,
        is_active: true,
      })
      .select('id')
      .single();
    teamBId = teamB!.id;

    await supabaseTestClient!.from('team_members').insert({
      team_id: teamBId,
      user_id: captain2UserId,
      role: 'player',
      battle_tag: 'CaptainB#0001',
    });

    // Add player as member of team A (not captain)
    await supabaseTestClient!.from('team_members').insert({
      team_id: teamAId,
      user_id: playerUserId,
      role: 'player',
      battle_tag: 'Player#0001',
    });
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    // Cleanup demandes
    if (teamAId) {
      await supabaseTestClient!
        .from('demandes')
        .delete()
        .eq('team_id', teamAId);
    }
    if (teamBId) {
      await supabaseTestClient!
        .from('demandes')
        .delete()
        .eq('team_id', teamBId);
    }
    // Also clean demandes by user
    for (const uid of [captainUserId, captain2UserId, playerUserId]) {
      if (uid) {
        await supabaseTestClient!.from('demandes').delete().eq('user_id', uid);
      }
    }
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_EMAIL, CAPTAIN2_EMAIL, PLAYER_EMAIL]) {
      await deleteTestUser(email);
    }
  });

  // ─── Auth ────────────────────────────────────────────

  test('GET returns 401 without token', async ({ request }) => {
    const res = await request.get('/api/demandes/scrim');
    expect(res.status()).toBe(401);
  });

  test('POST returns 401 without token', async ({ request }) => {
    const res = await request.post('/api/demandes/scrim', {
      data: { teamId: 'fake' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET returns 401 with invalid token', async ({ request }) => {
    const res = await request.get('/api/demandes/scrim', {
      headers: { Authorization: 'Bearer invalid_token_xyz' },
    });
    expect(res.status()).toBe(401);
  });

  test('PUT returns 405', async ({ request }) => {
    const res = await request.put('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: {},
    });
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error).toBe('Method not allowed');
  });

  // ─── POST validation ────────────────────────────────

  test('POST returns 400 without teamId', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('equipe adverse');
  });

  test('POST returns 400 with empty teamId', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: '   ' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST returns 400 with message too long', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: teamBId, message: 'x'.repeat(1001) },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('1000');
  });

  test('POST returns 400 with invalid date', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: teamBId, preferredDate: 'not-a-date' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('invalide');
  });

  // ─── Authorization ──────────────────────────────────

  test('POST returns 403 when non-captain tries to send scrim', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${playerToken}` },
      data: { teamId: teamBId },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('capitaine');
  });

  test('POST returns 400 when requesting scrim against own team', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: teamAId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('propre equipe');
  });

  test('POST returns 400 when target team does not exist', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("n'existe pas");
  });

  // ─── Successful flow ────────────────────────────────

  test('POST creates scrim request successfully', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: {
        teamId: teamBId,
        message: 'GG let us scrim!',
        preferredDate: '2026-04-15T18:00:00Z',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.demande).toBeTruthy();
    expect(body.demande.type).toBe('scrim');
    expect(body.demande.status).toBe('pending');
    expect(body.demande.team_id).toBe(teamBId);
    expect(body.demande.comment).toBe('GG let us scrim!');
    expect(body.message).toContain(`${PREFIX}-teamB`);
  });

  test('POST returns 400 for duplicate pending scrim', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    // The previous test already created a pending scrim to teamB
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: teamBId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('deja une demande');
  });

  // ─── GET ────────────────────────────────────────────

  test('GET returns scrim requests for authenticated user', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captainToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.demandes)).toBe(true);
    expect(body.demandes.length).toBeGreaterThanOrEqual(1);

    const scrim = body.demandes[0];
    expect(scrim.type).toBe('scrim');
    expect(scrim.team).toBeTruthy();
    expect(scrim.team.name).toContain(`${PREFIX}-teamB`);
  });

  test('GET returns empty array for user with no scrims', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captain2Token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.demandes).toEqual([]);
  });

  // ─── Cross-captain scrim ────────────────────────────

  test('captain2 can also create a scrim request to teamA', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/scrim', {
      headers: { Authorization: `Bearer ${captain2Token}` },
      data: { teamId: teamAId },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.demande.team_id).toBe(teamAId);
  });
});
