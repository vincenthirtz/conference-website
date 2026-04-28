import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const PREFIX = `E2E-MSG-${Date.now()}`;
const CAPTAIN_A_EMAIL = `test-msg-captA-${Date.now()}@test.local`;
const CAPTAIN_B_EMAIL = `test-msg-captB-${Date.now()}@test.local`;
const PLAYER_EMAIL = `test-msg-player-${Date.now()}@test.local`;
const PASSWORD = 'TestPassword123!';

test.describe('Captain messages API (/api/player/messages)', () => {
  let captainAToken: string;
  let captainBToken: string;
  let playerToken: string;
  let captainAUserId: string;
  let captainBUserId: string;
  let playerUserId: string;
  let teamAId: string;
  let teamBId: string;
  let conversationId: string;

  test.beforeAll(async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_A_EMAIL, CAPTAIN_B_EMAIL, PLAYER_EMAIL]) {
      await deleteTestUser(email);
    }

    // Create test users
    const captainA = await createTestPlayer(CAPTAIN_A_EMAIL, PASSWORD);
    const captainB = await createTestPlayer(CAPTAIN_B_EMAIL, PASSWORD);
    const player = await createTestPlayer(PLAYER_EMAIL, PASSWORD);
    captainAUserId = captainA!.id;
    captainBUserId = captainB!.id;
    playerUserId = player!.id;

    // Sign in
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

    const { data: authP } = await supabaseTestClient!.auth.signInWithPassword({
      email: PLAYER_EMAIL,
      password: PASSWORD,
    });
    playerToken = authP.session!.access_token;

    // Create team A
    const { data: teamA } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: `${PREFIX}-teamA`,
        captain_id: captainAUserId,
        is_active: true,
      })
      .select('id')
      .single();
    teamAId = teamA!.id;

    await supabaseTestClient!.from('team_members').insert({
      team_id: teamAId,
      user_id: captainAUserId,
      role: 'player',
      battle_tag: 'CaptA#0001',
    });

    // Create team B
    const { data: teamB } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: `${PREFIX}-teamB`,
        captain_id: captainBUserId,
        is_active: true,
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

    // Add player to team A (not captain)
    await supabaseTestClient!.from('team_members').insert({
      team_id: teamAId,
      user_id: playerUserId,
      role: 'player',
      battle_tag: 'Player#0001',
    });

    // Deterministic conversation ID
    conversationId =
      teamAId < teamBId ? `${teamAId}_${teamBId}` : `${teamBId}_${teamAId}`;
  });

  test.afterAll(async () => {
    if (!HAS_SUPABASE) return;
    // Cleanup messages
    for (const uid of [captainAUserId, captainBUserId, playerUserId]) {
      if (uid) {
        await supabaseTestClient!
          .from('demandes')
          .delete()
          .eq('user_id', uid)
          .eq('type', 'captain_message');
      }
    }
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const email of [CAPTAIN_A_EMAIL, CAPTAIN_B_EMAIL, PLAYER_EMAIL]) {
      await deleteTestUser(email);
    }
  });

  // ─── Auth ────────────────────────────────────────────

  test('GET /api/player/messages returns 401 without token', async ({
    request,
  }) => {
    const res = await request.get('/api/player/messages');
    expect(res.status()).toBe(401);
  });

  test('POST /api/player/messages returns 401 without token', async ({
    request,
  }) => {
    const res = await request.post('/api/player/messages', {
      data: { targetTeamId: 'fake', content: 'hello' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET returns 401 with invalid token', async ({ request }) => {
    const res = await request.get('/api/player/messages', {
      headers: { Authorization: 'Bearer invalid_token' },
    });
    expect(res.status()).toBe(401);
  });

  test('PUT returns 405', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.put('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: {},
    });
    expect(res.status()).toBe(405);
  });

  // ─── Authorization ──────────────────────────────────

  test('POST returns 403 when non-captain tries to send message', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/player/messages', {
      headers: { Authorization: `Bearer ${playerToken}` },
      data: { targetTeamId: teamBId, content: 'hello' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('capitaine');
  });

  test('GET returns 403 for non-captain', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/player/messages', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  // ─── POST validation ────────────────────────────────

  test('POST returns 400 without content', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: { targetTeamId: teamBId, content: '' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('vide');
  });

  test('POST returns 400 with message too long', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: { targetTeamId: teamBId, content: 'x'.repeat(2001) },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('2000');
  });

  test('POST returns 400 without targetTeamId', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: { content: 'hello' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('cible');
  });

  test('POST returns 400 when messaging own team', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: { targetTeamId: teamAId, content: 'hello' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('propre equipe');
  });

  test('POST returns 400 when target team does not exist', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: {
        targetTeamId: '00000000-0000-0000-0000-000000000000',
        content: 'hello',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("n'existe pas");
  });

  // ─── Successful messaging flow ──────────────────────

  test('Captain A sends a message to Captain B', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: {
        targetTeamId: teamBId,
        content: 'Salut, dispo pour un scrim ce soir ?',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.conversationId).toBe(conversationId);
    expect(body.message).toBeTruthy();
    expect(body.message.type).toBe('captain_message');
    expect(body.message.status).toBe('pending');
  });

  test('Captain B can see the conversation in inbox', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainBToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.conversations)).toBe(true);
    expect(body.conversations.length).toBeGreaterThanOrEqual(1);

    const conv = body.conversations.find(
      (c: { conversationId: string }) => c.conversationId === conversationId
    );
    expect(conv).toBeTruthy();
    expect(conv.unreadCount).toBeGreaterThanOrEqual(1);
    expect(conv.otherTeamName).toContain(`${PREFIX}-teamA`);
  });

  test('Captain A also sees the conversation in their inbox', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const conv = body.conversations.find(
      (c: { conversationId: string }) => c.conversationId === conversationId
    );
    expect(conv).toBeTruthy();
    // Captain A's own messages are not "unread" for them
    expect(conv.unreadCount).toBe(0);
  });

  test('Captain B replies to Captain A', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.post('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainBToken}` },
      data: { targetTeamId: teamAId, content: 'Oui, 21h ca marche ?' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.conversationId).toBe(conversationId);
  });

  // ─── Conversation detail ────────────────────────────

  test('GET conversation returns all messages in order', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get(`/api/player/messages/${conversationId}`, {
      headers: { Authorization: `Bearer ${captainAToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.conversationId).toBe(conversationId);
    expect(body.myTeamId).toBe(teamAId);
    expect(body.otherTeam).toBeTruthy();
    expect(body.otherTeam.name).toContain(`${PREFIX}-teamB`);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBe(2);

    // First message from captain A
    expect(body.messages[0].content).toContain('scrim ce soir');
    expect(body.messages[0].senderTeamId).toBe(teamAId);

    // Reply from captain B
    expect(body.messages[1].content).toContain('21h');
    expect(body.messages[1].senderTeamId).toBe(teamBId);
  });

  test('GET conversation returns 403 for unrelated captain', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    // Create a third team to test access control
    const thirdEmail = `test-msg-third-${Date.now()}@test.local`;
    const third = await createTestPlayer(thirdEmail, PASSWORD);
    const { data: teamC } = await supabaseTestClient!
      .from('teams')
      .insert({
        name: `${PREFIX}-teamC`,
        captain_id: third!.id,
        is_active: true,
      })
      .select('id')
      .single();
    await supabaseTestClient!.from('team_members').insert({
      team_id: teamC!.id,
      user_id: third!.id,
      role: 'player',
      battle_tag: 'Third#0001',
    });

    const { data: thirdAuth } =
      await supabaseTestClient!.auth.signInWithPassword({
        email: thirdEmail,
        password: PASSWORD,
      });

    const res = await request.get(`/api/player/messages/${conversationId}`, {
      headers: { Authorization: `Bearer ${thirdAuth.session!.access_token}` },
    });
    expect(res.status()).toBe(403);

    // Cleanup
    await supabaseTestClient!
      .from('team_members')
      .delete()
      .eq('team_id', teamC!.id);
    await supabaseTestClient!.from('teams').delete().eq('id', teamC!.id);
    await deleteTestUser(thirdEmail);
  });

  test('GET conversation returns 400 for invalid conversation ID', async ({
    request,
  }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.get('/api/player/messages/invalid-id', {
      headers: { Authorization: `Bearer ${captainAToken}` },
    });
    expect(res.status()).toBe(400);
  });

  // ─── Mark as read ───────────────────────────────────

  test('PATCH marks incoming messages as read', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    // Captain A has an unread message from Captain B
    const beforeRes = await request.get('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
    });
    const beforeBody = await beforeRes.json();
    const convBefore = beforeBody.conversations.find(
      (c: { conversationId: string }) => c.conversationId === conversationId
    );
    expect(convBefore.unreadCount).toBeGreaterThanOrEqual(1);

    // Mark as read
    const patchRes = await request.patch(
      `/api/player/messages/${conversationId}`,
      {
        headers: { Authorization: `Bearer ${captainAToken}` },
      }
    );
    expect(patchRes.status()).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.success).toBe(true);

    // Verify unread count is now 0
    const afterRes = await request.get('/api/player/messages', {
      headers: { Authorization: `Bearer ${captainAToken}` },
    });
    const afterBody = await afterRes.json();
    const convAfter = afterBody.conversations.find(
      (c: { conversationId: string }) => c.conversationId === conversationId
    );
    expect(convAfter.unreadCount).toBe(0);
  });

  // ─── Conversation detail endpoint methods ───────────

  test('PUT on conversation returns 405', async ({ request }) => {
    test.skip(!HAS_SUPABASE, 'Supabase manquant');
    const res = await request.put(`/api/player/messages/${conversationId}`, {
      headers: { Authorization: `Bearer ${captainAToken}` },
      data: {},
    });
    expect(res.status()).toBe(405);
  });
});
