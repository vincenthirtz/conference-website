import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const PREFIX = `E2E-JR-${Date.now()}`;
const CAPTAIN_EMAIL = `test-jr-captain-${Date.now()}@test.local`;
const PLAYER_EMAIL = `test-jr-player-${Date.now()}@test.local`;
const PASSWORD = 'TestPassword123!';

test.describe('Team join requests API', () => {
  let captainToken: string;
  let playerToken: string;
  let captainUserId: string;
  let playerUserId: string;
  let teamId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    // Cleanup
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_EMAIL, PLAYER_EMAIL]) {
      await deleteTestUser(email);
    }

    // Create test users
    const captain = await createTestPlayer(CAPTAIN_EMAIL, PASSWORD);
    const player = await createTestPlayer(PLAYER_EMAIL, PASSWORD);
    captainUserId = captain!.id;
    playerUserId = player!.id;

    // Sign in to get tokens
    const { data: captainAuth } = await supabaseTestClient!.auth.signInWithPassword({
      email: CAPTAIN_EMAIL,
      password: PASSWORD,
    });
    captainToken = captainAuth.session!.access_token;

    const { data: playerAuth } = await supabaseTestClient!.auth.signInWithPassword({
      email: PLAYER_EMAIL,
      password: PASSWORD,
    });
    playerToken = playerAuth.session!.access_token;

    // Create a team with captain, is_joinable = false by default
    const { data: team } = await supabaseTestClient!
      .from('teams')
      .insert({ name: `${PREFIX}-team`, captain_id: captainUserId })
      .select('id')
      .single();
    teamId = team!.id;

    // Add captain as team member
    await supabaseTestClient!.from('team_members').insert({
      team_id: teamId,
      user_id: captainUserId,
      role: 'player',
      battle_tag: 'Captain#0001',
    });
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    // Cleanup demandes
    if (teamId) {
      await supabaseTestClient!.from('demandes').delete().eq('team_id', teamId);
    }
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_EMAIL, PLAYER_EMAIL]) {
      await deleteTestUser(email);
    }
  });

  // ─── POST /api/teams/toggle-joinable ──────────────────

  test('POST /api/teams/toggle-joinable — 401 sans auth', async ({ request }) => {
    const res = await request.post('/api/teams/toggle-joinable');
    expect(res.status()).toBe(401);
  });

  test('POST /api/teams/toggle-joinable — 403 si pas capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/toggle-joinable', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/teams/toggle-joinable — active le recrutement', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/toggle-joinable', {
      headers: {
        Authorization: `Bearer ${captainToken}`,
        'Content-Type': 'application/json',
      },
      data: { joinable: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.is_joinable).toBe(true);
  });

  // ─── GET /api/teams?joinable=1 ───────────────────────

  test('GET /api/teams?joinable=1 — retourne les equipes rejoignables', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get(`/api/teams?joinable=1&search=${PREFIX}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.teams.length).toBeGreaterThan(0);
    expect(body.teams[0].is_joinable).toBe(true);
  });

  // ─── POST /api/demandes/join ──────────────────────────

  test('POST /api/demandes/join — 401 sans auth', async ({ request }) => {
    const res = await request.post('/api/demandes/join');
    expect(res.status()).toBe(401);
  });

  test('POST /api/demandes/join — 400 si equipe non rejoignable', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');

    // Disable joinable first
    await request.post('/api/teams/toggle-joinable', {
      headers: {
        Authorization: `Bearer ${captainToken}`,
        'Content-Type': 'application/json',
      },
      data: { joinable: false },
    });

    const res = await request.post('/api/demandes/join', {
      headers: {
        Authorization: `Bearer ${playerToken}`,
        'Content-Type': 'application/json',
      },
      data: { teamId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('accepte pas');

    // Re-enable for next tests
    await request.post('/api/teams/toggle-joinable', {
      headers: {
        Authorization: `Bearer ${captainToken}`,
        'Content-Type': 'application/json',
      },
      data: { joinable: true },
    });
  });

  test('POST /api/demandes/join — cree une demande avec role', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/join', {
      headers: {
        Authorization: `Bearer ${playerToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        teamId,
        message: 'Je veux rejoindre en tant que sub',
        desiredRole: 'substitute',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.demande.type).toBe('join');
    expect(body.demande.status).toBe('pending');
    expect(body.demande.payload.desired_role).toBe('substitute');
  });

  test('POST /api/demandes/join — 400 si demande deja en attente', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/join', {
      headers: {
        Authorization: `Bearer ${playerToken}`,
        'Content-Type': 'application/json',
      },
      data: { teamId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('deja une demande');
  });

  // ─── GET /api/teams/join-requests ─────────────────────

  test('GET /api/teams/join-requests — 401 sans auth', async ({ request }) => {
    const res = await request.get('/api/teams/join-requests');
    expect(res.status()).toBe(401);
  });

  test('GET /api/teams/join-requests — 403 si pas capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/teams/join-requests', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('GET /api/teams/join-requests — liste les demandes pending', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/teams/join-requests', {
      headers: { Authorization: `Bearer ${captainToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.demandes.length).toBeGreaterThan(0);
    expect(body.demandes[0].status).toBe('pending');
    expect(body.demandes[0].user).toBeTruthy();
  });

  // ─── POST /api/teams/join-requests (approve/reject) ──

  test('POST /api/teams/join-requests — 403 si pas capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/join-requests', {
      headers: {
        Authorization: `Bearer ${playerToken}`,
        'Content-Type': 'application/json',
      },
      data: { demandeId: 'fake-id', action: 'approve' },
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/teams/join-requests — 400 action invalide', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/join-requests', {
      headers: {
        Authorization: `Bearer ${captainToken}`,
        'Content-Type': 'application/json',
      },
      data: { demandeId: 'fake-id', action: 'invalid' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/teams/join-requests — approve ajoute le membre', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');

    // Get pending request ID
    const listRes = await request.get('/api/teams/join-requests', {
      headers: { Authorization: `Bearer ${captainToken}` },
    });
    const { demandes } = await listRes.json();
    expect(demandes.length).toBeGreaterThan(0);
    const demandeId = demandes[0].id;

    // Approve
    const res = await request.post('/api/teams/join-requests', {
      headers: {
        Authorization: `Bearer ${captainToken}`,
        'Content-Type': 'application/json',
      },
      data: { demandeId, action: 'approve' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.newStatus).toBe('approved');

    // Verify player is now a team member
    const { data: member } = await supabaseTestClient!
      .from('team_members')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', playerUserId)
      .maybeSingle();
    expect(member).toBeTruthy();
    expect(member!.role).toBe('substitute');

    // Verify no more pending requests
    const listRes2 = await request.get('/api/teams/join-requests', {
      headers: { Authorization: `Bearer ${captainToken}` },
    });
    const body2 = await listRes2.json();
    expect(body2.demandes.length).toBe(0);
  });

  // ─── POST /api/teams/toggle-joinable — desactive ─────

  test('POST /api/teams/toggle-joinable — desactive le recrutement', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/toggle-joinable', {
      headers: {
        Authorization: `Bearer ${captainToken}`,
        'Content-Type': 'application/json',
      },
      data: { joinable: false },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.is_joinable).toBe(false);

    // Verify team no longer appears in joinable list
    const listRes = await request.get(`/api/teams?joinable=1&search=${PREFIX}`);
    const listBody = await listRes.json();
    expect(listBody.teams.length).toBe(0);
  });
});
