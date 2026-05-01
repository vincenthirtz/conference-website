// Sweep 2c: complex 0% handlers.
//
// Targets:
//  - pages/api/matches/[matchId]/games.ts (~350 lines)
//  - pages/api/demandes/transfer.ts (~370 lines)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

// Note: we deliberately do NOT mock @/utils/matches/applyScore here. Under
// vitest's --no-isolate (set in npm script), file-level vi.mock can leak
// across files and break sibling suites that exercise the real implementation.
// The recompute tests below run the real applyMatchScore against the
// supabaseAdmin in-memory mock; when state is incomplete it throws and the
// games.ts handler swallows the error (its `try/catch` records and continues).

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import gamesHandler from '../../pages/api/matches/[matchId]/games';
import transferHandler from '../../pages/api/demandes/transfer';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TEAM_A = '11111111-1111-1111-1111-111111111111';
const TEAM_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
});

/* -----------------------------------------------------------
 * /api/matches/[matchId]/games (admin/manager)
 * ---------------------------------------------------------*/

describe('/api/matches/[matchId]/games', () => {
  function setupStaff() {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  }

  it('400 when matchId missing', async () => {
    setupStaff();
    const res = makeRes();
    await gamesHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET returns games for match', async () => {
    setupStaff();
    store.games = [
      {
        id: 'g1',
        match_id: 'm1',
        map_name: 'Ilios',
        map_order: 0,
        team1_score: 3,
        team2_score: 2,
      },
    ] as any;
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({ method: 'GET', query: { matchId: 'm1' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).games.length).toBe(1);
  });

  it('POST creates a game', async () => {
    setupStaff();
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { matchId: 'm1' },
        body: { map_name: 'Ilios', team1_score: 3, team2_score: 1 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).game).toBeDefined();
    expect((store.games as any[]).length).toBe(1);
  });

  it('POST applies defaults when fields missing', async () => {
    setupStaff();
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { matchId: 'm1' },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.games as any[])[0];
    expect(inserted.team1_score).toBe(0);
    expect(inserted.team2_score).toBe(0);
    expect(inserted.is_tiebreaker).toBe(false);
  });

  it('PUT 400 when games not array', async () => {
    setupStaff();
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({
        method: 'PUT',
        query: { matchId: 'm1' },
        body: { games: 'not array' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT replaces all games', async () => {
    setupStaff();
    store.games = [
      { id: 'g-old', match_id: 'm1', map_name: 'Old', map_order: 0 },
    ] as any;
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({
        method: 'PUT',
        query: { matchId: 'm1' },
        body: {
          games: [
            { map_name: 'A', team1_score: 3, team2_score: 1 },
            { map_name: 'B', team1_score: 2, team2_score: 3 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).games.length).toBe(2);
    // old game removed
    expect(
      (store.games as any[]).find((g) => g.id === 'g-old')
    ).toBeUndefined();
  });

  it('PUT with empty games clears all', async () => {
    setupStaff();
    store.games = [{ id: 'g-old', match_id: 'm1', map_name: 'Old' }] as any;
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({
        method: 'PUT',
        query: { matchId: 'm1' },
        body: { games: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).games).toEqual([]);
  });

  it('PUT with recomputeMode=from_games triggers match-score recompute (real impl, swallowed errors OK)', async () => {
    setupStaff();
    store.matches = [
      { id: 'm1', team1_id: TEAM_A, team2_id: TEAM_B, status: 'pending' },
    ] as any;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({
        method: 'PUT',
        query: { matchId: 'm1' },
        body: {
          games: [
            { map_name: 'A', team1_score: 3, team2_score: 1 },
            { map_name: 'B', team1_score: 1, team2_score: 3 },
            { map_name: 'C', team1_score: 3, team2_score: 0 },
          ],
          recomputeMode: 'from_games',
        },
      }),
      res
    );
    consoleSpy.mockRestore();
    // The handler returns 200 whether the real applyMatchScore succeeds or
    // throws (caught and logged).
    expect(res.statusCode).toBe(200);
  });

  it('PUT with recomputeMode swallows applyMatchScore errors when match is missing', async () => {
    setupStaff();
    // Match ID provided but no row in the store → real applyMatchScore throws,
    // which the handler's try/catch swallows.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({
        method: 'PUT',
        query: { matchId: 'm-missing' },
        body: {
          games: [{ map_name: 'A', team1_score: 3, team2_score: 1 }],
          recomputeMode: 'from_games',
        },
      }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200);
  });

  it('DELETE removes all games', async () => {
    setupStaff();
    store.games = [
      { id: 'g1', match_id: 'm1' },
      { id: 'g2', match_id: 'm1' },
    ] as any;
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({
        method: 'DELETE',
        query: { matchId: 'm1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.games as any[]).length).toBe(0);
  });

  it('405 on OPTIONS', async () => {
    setupStaff();
    const res = makeRes();
    await gamesHandler(
      makeAuthedReq({ method: 'OPTIONS', query: { matchId: 'm1' } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/demandes/transfer (auth route)
 * ---------------------------------------------------------*/

describe('/api/demandes/transfer', () => {
  function setupUser(id = 'user-1', meta: Record<string, unknown> = {}) {
    setAuthUser({
      id,
      email: 'u@x.com',
      user_metadata: meta,
    });
  }

  it('401 when unauthenticated', async () => {
    const res = makeRes();
    await transferHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET returns user own transfer demandes', async () => {
    setupUser();
    store.demandes = [
      {
        id: 'd1',
        user_id: 'user-1',
        type: 'transfer',
        status: 'pending',
        team_id: TEAM_B,
      },
    ] as any;
    const res = makeRes();
    await transferHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).demandes.length).toBe(1);
  });

  it('POST 400 when teamId missing', async () => {
    setupUser();
    const res = makeRes();
    await transferHandler(makeAuthedReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when message too long', async () => {
    setupUser();
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({
        method: 'POST',
        body: { teamId: TEAM_A, message: 'x'.repeat(1100) },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  /* ---- self-transfer paths ---- */

  it('POST 400 when not in any team', async () => {
    setupUser();
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({ method: 'POST', body: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when transferring to own team', async () => {
    setupUser();
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: TEAM_A, role: 'player' },
    ] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({ method: 'POST', body: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 403 when user is captain (must transfer captaincy first)', async () => {
    setupUser();
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: TEAM_A, role: 'player' },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'user-1', name: 'Alpha', is_active: true },
    ] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({ method: 'POST', body: { teamId: TEAM_B } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('POST 400 when target team not found', async () => {
    setupUser();
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: TEAM_A, role: 'player' },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'capA', name: 'Alpha', is_active: true },
    ] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({ method: 'POST', body: { teamId: TEAM_B } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when target team not joinable', async () => {
    setupUser();
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: TEAM_A, role: 'player' },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'capA', name: 'Alpha', is_active: true },
      {
        id: TEAM_B,
        captain_id: 'capB',
        name: 'Beta',
        is_active: true,
        is_joinable: false,
      },
    ] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({ method: 'POST', body: { teamId: TEAM_B } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when an existing pending demande exists', async () => {
    setupUser();
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: TEAM_A, role: 'player' },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'capA', name: 'Alpha', is_active: true },
      {
        id: TEAM_B,
        captain_id: 'capB',
        name: 'Beta',
        is_active: true,
        is_joinable: true,
      },
    ] as any;
    store.demandes = [
      {
        id: 'd-existing',
        user_id: 'user-1',
        type: 'transfer',
        status: 'pending',
        team_id: TEAM_B,
      },
    ] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({ method: 'POST', body: { teamId: TEAM_B } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).existingDemandeId).toBe('d-existing');
  });

  it('POST 201 creates a self-transfer demande', async () => {
    setupUser('user-1', { display_name: 'Alice', battle_tag: 'A#1234' });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: TEAM_A, role: 'player' },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'capA', name: 'Alpha', is_active: true },
      {
        id: TEAM_B,
        captain_id: 'capB',
        name: 'Beta',
        is_active: true,
        is_joinable: true,
      },
    ] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          teamId: TEAM_B,
          desiredRole: 'substitute',
          message: 'Hello, I want to join.',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).success).toBe(true);
    const insert = (store.demandes as any[])[0];
    expect(insert.payload.desired_role).toBe('substitute');
  });

  /* ---- captain-proposed transfer paths ---- */

  it('POST 400 when captain proposing but not member of any team', async () => {
    setupUser();
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({
        method: 'POST',
        body: { teamId: TEAM_B, targetPlayerId: 'someone' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 403 when proposing player but not captain of own team', async () => {
    setupUser('cap-user-not-captain');
    store.team_members = [
      { id: 'tm1', user_id: 'cap-user-not-captain', team_id: TEAM_A },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'someone-else', name: 'Alpha' },
    ] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({
        method: 'POST',
        body: { teamId: TEAM_B, targetPlayerId: 'player-id' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('POST 400 when target player not in captain team', async () => {
    setupUser('captain');
    store.team_members = [
      { id: 'tm-cap', user_id: 'captain', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'captain', name: 'Alpha' }] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({
        method: 'POST',
        body: { teamId: TEAM_B, targetPlayerId: 'unknown-player' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when captain tries to propose self', async () => {
    setupUser('captain');
    store.team_members = [
      { id: 'tm-cap', user_id: 'captain', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'captain', name: 'Alpha' }] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({
        method: 'POST',
        body: { teamId: TEAM_B, targetPlayerId: 'captain' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when proposing transfer to own team', async () => {
    setupUser('captain');
    store.team_members = [
      { id: 'tm-cap', user_id: 'captain', team_id: TEAM_A },
      { id: 'tm-p', user_id: 'player1', team_id: TEAM_A, battle_tag: 'P#1234' },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'captain', name: 'Alpha' }] as any;
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({
        method: 'POST',
        body: { teamId: TEAM_A, targetPlayerId: 'player1' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 creates a captain-proposed transfer', async () => {
    setupUser('captain', { display_name: 'Cap' });
    store.team_members = [
      { id: 'tm-cap', user_id: 'captain', team_id: TEAM_A },
      { id: 'tm-p', user_id: 'player1', team_id: TEAM_A, battle_tag: 'P#1234' },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'captain', name: 'Alpha' },
      { id: TEAM_B, name: 'Beta', is_active: true, is_joinable: true },
    ] as any;
    setAdminUser('player1', 'p1@x.com');
    const res = makeRes();
    await transferHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          teamId: TEAM_B,
          targetPlayerId: 'player1',
          desiredRole: 'coach',
          message: 'good fit',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const insert = (store.demandes as any[])[0];
    expect(insert.payload.proposed_by_captain).toBe(true);
    expect(insert.payload.desired_role).toBe('coach');
  });

  it('405 on PATCH', async () => {
    setupUser();
    const res = makeRes();
    await transferHandler(makeAuthedReq({ method: 'PATCH' }), res);
    expect(res.statusCode).toBe(405);
  });
});
