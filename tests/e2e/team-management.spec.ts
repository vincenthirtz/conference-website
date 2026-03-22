import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const PREFIX = `E2E-TM-${Date.now()}`;
const CAPTAIN_EMAIL = `test-captain-${Date.now()}@test.local`;
const MEMBER_EMAIL = `test-member-${Date.now()}@test.local`;
const OUTSIDER_EMAIL = `test-outsider-${Date.now()}@test.local`;
const PASSWORD = 'TestPassword123!';

test.describe('Team management API', () => {
  let captainToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let captainUserId: string;
  let memberUserId: string;
  let outsiderUserId: string;
  let teamId: string;
  let memberRecordId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    // Cleanup
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_EMAIL, MEMBER_EMAIL, OUTSIDER_EMAIL]) {
      await deleteTestUser(email);
    }

    // Create test users
    const captain = await createTestPlayer(CAPTAIN_EMAIL, PASSWORD);
    const member = await createTestPlayer(MEMBER_EMAIL, PASSWORD);
    const outsider = await createTestPlayer(OUTSIDER_EMAIL, PASSWORD);
    captainUserId = captain!.id;
    memberUserId = member!.id;
    outsiderUserId = outsider!.id;

    // Sign in to get tokens
    const { data: captainAuth } = await supabaseTestClient!.auth.signInWithPassword({
      email: CAPTAIN_EMAIL,
      password: PASSWORD,
    });
    captainToken = captainAuth.session!.access_token;

    const { data: memberAuth } = await supabaseTestClient!.auth.signInWithPassword({
      email: MEMBER_EMAIL,
      password: PASSWORD,
    });
    memberToken = memberAuth.session!.access_token;

    const { data: outsiderAuth } = await supabaseTestClient!.auth.signInWithPassword({
      email: OUTSIDER_EMAIL,
      password: PASSWORD,
    });
    outsiderToken = outsiderAuth.session!.access_token;

    // Create a team with captain + member via admin client
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

    // Add member as team member
    const { data: memberRec } = await supabaseTestClient!
      .from('team_members')
      .insert({
        team_id: teamId,
        user_id: memberUserId,
        role: 'player',
        battle_tag: 'Member#0002',
      })
      .select('id')
      .single();
    memberRecordId = memberRec!.id;
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_EMAIL, MEMBER_EMAIL, OUTSIDER_EMAIL]) {
      await deleteTestUser(email);
    }
  });

  // ─── POST /api/teams/leave ──────────────────────────────

  test('POST /api/teams/leave — 401 sans auth', async ({ request }) => {
    const res = await request.post('/api/teams/leave');
    expect(res.status()).toBe(401);
  });

  test('POST /api/teams/leave — 400 si pas membre', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/leave', {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('aucune équipe');
  });

  test('POST /api/teams/leave — 403 si capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/teams/leave', {
      headers: { Authorization: `Bearer ${captainToken}` },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('capitaine');
  });

  test('POST /api/teams/leave — 405 si GET', async ({ request }) => {
    const res = await request.get('/api/teams/leave');
    expect(res.status()).toBe(405);
  });

  // ─── PATCH /api/teams/transfer-captain ──────────────────

  test('PATCH /api/teams/transfer-captain — 401 sans auth', async ({ request }) => {
    const res = await request.patch('/api/teams/transfer-captain');
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/teams/transfer-captain — 403 si pas capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.patch('/api/teams/transfer-captain', {
      headers: { Authorization: `Bearer ${memberToken}` },
      data: { newCaptainUserId: captainUserId },
    });
    expect(res.status()).toBe(403);
  });

  test('PATCH /api/teams/transfer-captain — 400 si même utilisateur', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.patch('/api/teams/transfer-captain', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { newCaptainUserId: captainUserId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('déjà capitaine');
  });

  test('PATCH /api/teams/transfer-captain — 400 si cible pas dans l\'équipe', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.patch('/api/teams/transfer-captain', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { newCaptainUserId: outsiderUserId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('pas membre');
  });

  // ─── DELETE /api/teams/[id]/members ─────────────────────

  test('DELETE /api/teams/[id]/members — 401 sans auth', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.delete(`/api/teams/${teamId}/members`, {
      data: { memberId: memberRecordId },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/teams/[id]/members — 403 si pas capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.delete(`/api/teams/${teamId}/members`, {
      headers: { Authorization: `Bearer ${memberToken}` },
      data: { memberId: memberRecordId },
    });
    expect(res.status()).toBe(403);
  });

  test('DELETE /api/teams/[id]/members — 400 si memberId manquant', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.delete(`/api/teams/${teamId}/members`, {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  // ─── PATCH /api/admin/teams/my (edit team) ─────────────

  test('PATCH /api/admin/teams/my — 401 sans auth', async ({ request }) => {
    const res = await request.patch('/api/admin/teams/my', {
      data: { teamId: 'fake' },
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/admin/teams/my — 403 si pas capitaine', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.patch('/api/admin/teams/my', {
      headers: { Authorization: `Bearer ${memberToken}` },
      data: { teamId, name: 'Nouveau Nom' },
    });
    expect(res.status()).toBe(403);
  });

  test('PATCH /api/admin/teams/my — 400 si nom trop court', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.patch('/api/admin/teams/my', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId, name: 'A' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('2 et 100');
  });

  test('PATCH /api/admin/teams/my — 400 si URL invalide', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.patch('/api/admin/teams/my', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId, website: 'javascript:alert(1)' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('URL');
  });

  test('PATCH /api/admin/teams/my — 200 mise à jour valide', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const newName = `${PREFIX}-renamed`;
    const res = await request.patch('/api/admin/teams/my', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId, name: newName, description: 'Updated desc' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.team?.name).toBe(newName);
  });

  // ─── DELETE /api/demandes/cancel ─────────────────────────

  test('DELETE /api/demandes/cancel — 401 sans auth', async ({ request }) => {
    const res = await request.delete('/api/demandes/cancel', {
      data: { demandeId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/demandes/cancel — 400 sans demandeId', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.delete('/api/demandes/cancel', {
      headers: { Authorization: `Bearer ${outsiderToken}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('DELETE /api/demandes/cancel — 404 si demande inexistante', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.delete('/api/demandes/cancel', {
      headers: { Authorization: `Bearer ${outsiderToken}` },
      data: { demandeId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(404);
  });

  // ─── POST /api/teams/create-with-member validations ─────

  test('POST /api/teams/create-with-member — 400 si nom trop court', async ({ request }) => {
    const res = await request.post('/api/teams/create-with-member', {
      data: { name: 'A' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('2 caractères');
  });

  test('POST /api/teams/create-with-member — 400 si URL invalide', async ({ request }) => {
    const res = await request.post('/api/teams/create-with-member', {
      data: { name: 'ValidTeam', logo_url: 'javascript:alert(1)' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('URL');
  });

  test('POST /api/teams/create-with-member — 400 si description trop longue', async ({ request }) => {
    const res = await request.post('/api/teams/create-with-member', {
      data: { name: 'ValidTeam', description: 'x'.repeat(2001) },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('2000');
  });

  // ─── GET /api/teams — member_count ──────────────────────

  test('GET /api/teams renvoie member_count', async ({ request }) => {
    const res = await request.get('/api/teams?limit=1');
    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.teams?.length > 0) {
      expect(typeof body.teams[0].member_count).toBe('number');
    }
  });

  // ─── Flux complet : transfert + leave ───────────────────

  test('Flux : transfert capitanat puis leave', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');

    // Transférer le capitanat au membre
    const transferRes = await request.patch('/api/teams/transfer-captain', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { newCaptainUserId: memberUserId },
    });
    expect(transferRes.status()).toBe(200);
    const transferBody = await transferRes.json();
    expect(transferBody.success).toBe(true);

    // L'ancien capitaine peut maintenant quitter
    const leaveRes = await request.post('/api/teams/leave', {
      headers: { Authorization: `Bearer ${captainToken}` },
    });
    expect(leaveRes.status()).toBe(200);
    const leaveBody = await leaveRes.json();
    expect(leaveBody.success).toBe(true);

    // Vérifier en base que le captain_id a changé
    const { data: team } = await supabaseTestClient!
      .from('teams')
      .select('captain_id')
      .eq('id', teamId)
      .single();
    expect(team!.captain_id).toBe(memberUserId);
  });
});
