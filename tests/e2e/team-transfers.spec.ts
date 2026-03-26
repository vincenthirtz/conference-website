import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const PREFIX = `E2E-TR-${TS}`;
const CAPTAIN_A_EMAIL = `test-tr-capA-${TS}@test.local`;
const CAPTAIN_B_EMAIL = `test-tr-capB-${TS}@test.local`;
const PLAYER_EMAIL = `test-tr-player-${TS}@test.local`;
const COACH_EMAIL = `test-tr-coach-${TS}@test.local`;
const PASSWORD = 'TestPassword123!';

// Separate admin client that won't be affected by signIn calls
const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
  '';
const adminClient =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

/**
 * Nettoie toutes les donnees de test creees par ce fichier :
 * demandes, news, team_members, teams, auth users correspondant aux patterns E2E-TR-*
 */
async function cleanupAllTestData() {
  if (!adminClient) return;

  // Supprimer les demandes liees aux equipes de test
  const { data: testTeams } = await adminClient
    .from('teams')
    .select('id')
    .ilike('name', 'E2E-TR-%');

  if (testTeams && testTeams.length > 0) {
    const teamIds = testTeams.map((t) => t.id);
    await adminClient.from('demandes').delete().in('team_id', teamIds);
  }

  // Supprimer les news de transfert generees par les tests
  await adminClient.from('news').delete().ilike('slug', 'team-%-transfer-%');

  // Supprimer les equipes (team_members + teams)
  await deleteTeamsByName(['E2E-TR-%']);

  // Supprimer tous les auth users de test (pattern test-tr-*@test.local)
  const { data } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 100 });
  const users = (data as any)?.users as { id: string; email?: string }[] | undefined;
  const testUsers = users?.filter(
    (u) => u.email && /^test-tr-\w+-\d+@test\.local$/.test(u.email)
  ) ?? [];

  for (const user of testUsers) {
    await adminClient.auth.admin.deleteUser(user.id);
  }
}

test.describe('Team transfers, role management & coach system', () => {
  let captainAToken: string;
  let captainBToken: string;
  let playerToken: string;
  let coachToken: string;
  let captainAUserId: string;
  let captainBUserId: string;
  let playerUserId: string;
  let teamAId: string;
  let teamBId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    // Nettoyage preventif : supprimer les restes d'un run precedent qui aurait crashe
    await cleanupAllTestData();

    // Cleanup du run courant
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_A_EMAIL, CAPTAIN_B_EMAIL, PLAYER_EMAIL, COACH_EMAIL]) {
      await deleteTestUser(email);
    }

    // Create test users
    const capA = await createTestPlayer(CAPTAIN_A_EMAIL, PASSWORD);
    const capB = await createTestPlayer(CAPTAIN_B_EMAIL, PASSWORD);
    const player = await createTestPlayer(PLAYER_EMAIL, PASSWORD);
    await createTestPlayer(COACH_EMAIL, PASSWORD);
    captainAUserId = capA!.id;
    captainBUserId = capB!.id;
    playerUserId = player!.id;

    // Create teams and members via admin client (bypasses RLS)
    const { data: tA, error: tAErr } = await adminClient!
      .from('teams')
      .insert({ name: `${PREFIX}-teamA`, captain_id: captainAUserId, is_joinable: true })
      .select('id')
      .single();
    if (tAErr) throw new Error(`Failed to create team A: ${tAErr.message}`);
    teamAId = tA!.id;

    const { error: mAErr } = await adminClient!.from('team_members').insert([
      { team_id: teamAId, user_id: captainAUserId, role: 'player', battle_tag: `CapA${TS}#0001` },
      { team_id: teamAId, user_id: playerUserId, role: 'player', battle_tag: `Plr${TS}#0001` },
    ]);
    if (mAErr) throw new Error(`Failed to add team A members: ${mAErr.message}`);

    const { data: tB, error: tBErr } = await adminClient!
      .from('teams')
      .insert({ name: `${PREFIX}-teamB`, captain_id: captainBUserId, is_joinable: true })
      .select('id')
      .single();
    if (tBErr) throw new Error(`Failed to create team B: ${tBErr.message}`);
    teamBId = tB!.id;

    const { error: mBErr } = await adminClient!.from('team_members').insert({
      team_id: teamBId,
      user_id: captainBUserId,
      role: 'player',
      battle_tag: `CapB${TS}#0001`,
    });
    if (mBErr) throw new Error(`Failed to add team B members: ${mBErr.message}`);

    // Sign in to get tokens
    const signIn = async (email: string) => {
      const { data } = await supabaseTestClient!.auth.signInWithPassword({ email, password: PASSWORD });
      return data.session!.access_token;
    };
    captainAToken = await signIn(CAPTAIN_A_EMAIL);
    captainBToken = await signIn(CAPTAIN_B_EMAIL);
    playerToken = await signIn(PLAYER_EMAIL);
    coachToken = await signIn(COACH_EMAIL);
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE || !adminClient) return;
    await cleanupAllTestData();
  });

  // ─── POST /api/demandes/transfer — validation ─────────

  test('POST /api/demandes/transfer — 401 sans auth', async ({ request }) => {
    const res = await request.post('/api/demandes/transfer');
    expect(res.status()).toBe(401);
  });

  test('POST /api/demandes/transfer — validation errors', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');

    // Not in a team
    const res1 = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
      data: { teamId: teamBId },
    });
    expect(res1.status()).toBe(400);
    expect((await res1.json()).error).toContain('aucune equipe');

    // Same team
    const res2 = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${playerToken}`, 'Content-Type': 'application/json' },
      data: { teamId: teamAId },
    });
    expect(res2.status()).toBe(400);
    expect((await res2.json()).error).toContain('deja dans cette equipe');

    // Captain cannot transfer
    const res3 = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${captainAToken}`, 'Content-Type': 'application/json' },
      data: { teamId: teamBId },
    });
    expect(res3.status()).toBe(403);
    expect((await res3.json()).error).toContain('capitaine');
  });

  // ─── Transfer flow: create -> list -> approve ─────────

  test('POST /api/demandes/transfer — cree une demande de transfert', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${playerToken}`, 'Content-Type': 'application/json' },
      data: {
        teamId: teamBId,
        desiredRole: 'substitute',
        message: 'Je veux rejoindre team B',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.demande.type).toBe('transfer');
    expect(body.demande.status).toBe('pending');
    expect(body.demande.payload.desired_role).toBe('substitute');
    expect(body.demande.payload.from_team_id).toBe(teamAId);
  });

  test('POST /api/demandes/transfer — 400 si demande deja en attente', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${playerToken}`, 'Content-Type': 'application/json' },
      data: { teamId: teamBId },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('deja une demande');
  });

  test('GET /api/demandes/transfer — retourne les demandes du joueur', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.demandes.length).toBeGreaterThan(0);
    expect(body.demandes[0].type).toBe('transfer');
  });

  // ─── GET /api/teams/transfer-requests ──────────────────

  test('GET /api/teams/transfer-requests — 401 sans auth', async ({ request }) => {
    const res = await request.get('/api/teams/transfer-requests');
    expect(res.status()).toBe(401);
  });

  test('GET /api/teams/transfer-requests — 403 si pas capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/teams/transfer-requests', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('GET /api/teams/transfer-requests — liste les demandes pending', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/teams/transfer-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.demandes.length).toBeGreaterThan(0);
    expect(body.demandes[0].status).toBe('pending');
    expect(body.demandes[0].user).toBeTruthy();
  });

  // ─── POST /api/teams/transfer-requests (approve) ──────

  test('POST /api/teams/transfer-requests — approve transfere le joueur', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');

    // Get pending transfer request
    const listRes = await request.get('/api/teams/transfer-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
    });
    const { demandes } = await listRes.json();
    expect(demandes.length).toBeGreaterThan(0);
    const demandeId = demandes[0].id;

    // Approve
    const res = await request.post('/api/teams/transfer-requests', {
      headers: { Authorization: `Bearer ${captainBToken}`, 'Content-Type': 'application/json' },
      data: { demandeId, action: 'approve' },
    });
    expect(res.status()).toBe(200);
    const approveBody = await res.json();
    expect(approveBody.success).toBe(true);
    expect(approveBody.newStatus).toBe('approved');

    // Verify player is now in team B (use admin client to bypass RLS)
    const { data: memberB } = await adminClient!
      .from('team_members')
      .select('id, role, team_id')
      .eq('user_id', playerUserId)
      .eq('team_id', teamBId)
      .maybeSingle();
    expect(memberB).toBeTruthy();
    expect(memberB!.role).toBe('substitute');

    // Verify player is no longer in team A
    const { data: memberA } = await adminClient!
      .from('team_members')
      .select('id')
      .eq('user_id', playerUserId)
      .eq('team_id', teamAId)
      .maybeSingle();
    expect(memberA).toBeNull();
  });

  // ─── PATCH /api/teams/update-member-role ───────────────

  test('PATCH /api/teams/update-member-role — 401 sans auth', async ({ request }) => {
    const res = await request.patch('/api/teams/update-member-role');
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/teams/update-member-role — 403 si pas capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.patch('/api/teams/update-member-role', {
      headers: { Authorization: `Bearer ${playerToken}`, 'Content-Type': 'application/json' },
      data: { memberId: '00000000-0000-0000-0000-000000000000', role: 'player' },
    });
    expect(res.status()).toBe(403);
  });

  test('PATCH /api/teams/update-member-role — capitaine change sub en player puis player en sub', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');

    // Get player's member ID in team B (use admin client)
    const { data: member } = await adminClient!
      .from('team_members')
      .select('id, role')
      .eq('user_id', playerUserId)
      .eq('team_id', teamBId)
      .maybeSingle();
    expect(member).toBeTruthy();

    // Change substitute -> player
    const res1 = await request.patch('/api/teams/update-member-role', {
      headers: { Authorization: `Bearer ${captainBToken}`, 'Content-Type': 'application/json' },
      data: { memberId: member!.id, role: 'player' },
    });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.newRole).toBe('player');
    expect(body1.isSubstitute).toBe(false);

    // Change player -> substitute
    const res2 = await request.patch('/api/teams/update-member-role', {
      headers: { Authorization: `Bearer ${captainBToken}`, 'Content-Type': 'application/json' },
      data: { memberId: member!.id, role: 'substitute' },
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.newRole).toBe('substitute');
    expect(body2.isSubstitute).toBe(true);

    // Change to coach
    const res3 = await request.patch('/api/teams/update-member-role', {
      headers: { Authorization: `Bearer ${captainBToken}`, 'Content-Type': 'application/json' },
      data: { memberId: member!.id, role: 'coach' },
    });
    expect(res3.status()).toBe(200);
    expect((await res3.json()).newRole).toBe('coach');
  });

  // ─── Coach join (no player limit) ─────────────────────

  test('POST /api/demandes/join — coach peut demander a rejoindre en tant que coach', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');

    const res = await request.post('/api/demandes/join', {
      headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
      data: {
        teamId: teamBId,
        desiredRole: 'coach',
        message: 'Je veux etre coach',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.demande.payload.desired_role).toBe('coach');
  });
});
