import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const PREFIX = `E2E-CTRF-${Date.now()}`;
const CAPTAIN_EMAIL = `test-ctrf-captain-${Date.now()}@test.local`;
const PLAYER_EMAIL = `test-ctrf-player-${Date.now()}@test.local`;
const CAPTAIN_B_EMAIL = `test-ctrf-captB-${Date.now()}@test.local`;
const PASSWORD = 'TestPassword123!';

test.describe('Captain-proposed transfer API', () => {
  let captainToken: string;
  let playerToken: string;
  let captainBToken: string;
  let captainUserId: string;
  let playerUserId: string;
  let captainBUserId: string;
  let teamAId: string;
  let teamBId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_EMAIL, PLAYER_EMAIL, CAPTAIN_B_EMAIL]) {
      await deleteTestUser(email);
    }

    const captain = await createTestPlayer(CAPTAIN_EMAIL, PASSWORD);
    const player = await createTestPlayer(PLAYER_EMAIL, PASSWORD);
    const captainB = await createTestPlayer(CAPTAIN_B_EMAIL, PASSWORD);
    captainUserId = captain!.id;
    playerUserId = player!.id;
    captainBUserId = captainB!.id;

    const { data: authC } = await supabaseTestClient!.auth.signInWithPassword({
      email: CAPTAIN_EMAIL,
      password: PASSWORD,
    });
    captainToken = authC.session!.access_token;

    const { data: authP } = await supabaseTestClient!.auth.signInWithPassword({
      email: PLAYER_EMAIL,
      password: PASSWORD,
    });
    playerToken = authP.session!.access_token;

    const { data: authB } = await supabaseTestClient!.auth.signInWithPassword({
      email: CAPTAIN_B_EMAIL,
      password: PASSWORD,
    });
    captainBToken = authB.session!.access_token;

    // Team A with captain + player
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

    await supabaseTestClient!.from('team_members').insert([
      {
        team_id: teamAId,
        user_id: captainUserId,
        role: 'player',
        battle_tag: 'Capt#0001',
      },
      {
        team_id: teamAId,
        user_id: playerUserId,
        role: 'player',
        battle_tag: 'Player#0001',
      },
    ]);

    // Team B (target, joinable)
    const { data: teamB } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: `${PREFIX}-teamB`,
        captain_id: captainBUserId,
        is_active: true,
        is_joinable: true,
      })
      .select('id')
      .single();
    teamBId = teamB!.id;

    await supabaseTestClient!.from('team_members').insert({
      team_id: teamBId,
      user_id: captainBUserId,
      role: 'player',
      battle_tag: 'CaptB#0001',
    });
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    for (const uid of [captainUserId, playerUserId, captainBUserId]) {
      if (uid) {
        await supabaseTestClient!.from('demandes').delete().eq('user_id', uid);
      }
    }
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_EMAIL, PLAYER_EMAIL, CAPTAIN_B_EMAIL]) {
      await deleteTestUser(email);
    }
  });

  // ─── Authorization ──────────────────────────────────

  test('Non-captain cannot propose a transfer', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${playerToken}` },
      data: { teamId: teamBId, targetPlayerId: captainUserId },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('capitaine');
  });

  // ─── Validation ─────────────────────────────────────

  test('Cannot propose transfer of player not in team', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: teamBId, targetPlayerId: captainBUserId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("n'est pas dans ton equipe");
  });

  test('Cannot propose transfer of self via targetPlayerId', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: teamBId, targetPlayerId: captainUserId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('classique');
  });

  test('Cannot propose transfer to own team', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: teamAId, targetPlayerId: playerUserId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('deja dans cette equipe');
  });

  test('Cannot propose transfer to non-existent team', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: {
        teamId: '00000000-0000-0000-0000-000000000000',
        targetPlayerId: playerUserId,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("n'existe pas");
  });

  // ─── Success ────────────────────────────────────────

  test('Captain proposes transfer of player to team B', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: {
        teamId: teamBId,
        targetPlayerId: playerUserId,
        desiredRole: 'substitute',
        message: 'Bon joueur, il sera bien chez vous',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.demande).toBeTruthy();
    expect(body.demande.type).toBe('transfer');
    expect(body.demande.user_id).toBe(playerUserId);
    expect(body.demande.team_id).toBe(teamBId);
    expect(body.demande.comment).toContain('Bon joueur');

    const payload = body.demande.payload;
    expect(payload.proposed_by_captain).toBe(true);
    expect(payload.proposed_by_user_id).toBe(captainUserId);
    expect(payload.desired_role).toBe('substitute');
    expect(payload.from_team_id).toBe(teamAId);
  });

  test('Cannot create duplicate pending transfer for same player', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/demandes/transfer', {
      headers: { Authorization: `Bearer ${captainToken}` },
      data: { teamId: teamBId, targetPlayerId: playerUserId },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('deja une demande en attente');
  });

  test('Captain B sees the proposed transfer in transfer-requests', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/teams/transfer-requests', {
      headers: { Authorization: `Bearer ${captainBToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.demandes.length).toBeGreaterThanOrEqual(1);

    const transfer = body.demandes.find(
      (d: { payload: { proposed_by_captain?: boolean } }) =>
        d.payload?.proposed_by_captain
    );
    expect(transfer).toBeTruthy();
    expect(transfer.payload.from_team_name).toContain(`${PREFIX}-teamA`);
  });
});
