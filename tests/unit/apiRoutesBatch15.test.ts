import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import scrimRequestsHandler from '../../pages/api/teams/scrim-requests';
import tournamentTeamsHandler from '../../pages/api/admin/tournament/[id]/teams';
import mvpLeaderboardHandler from '../../pages/api/tournaments/[id]/mvp-leaderboard';
import exportResultsHandler from '../../pages/api/admin/tournament/[id]/export-results';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
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
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = false): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
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
    endBody: undefined as unknown,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = (b?: unknown) => ((res.endBody = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
});

const TID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440100';

/* -----------------------------------------------------------
 * /api/teams/scrim-requests (captain)
 * ---------------------------------------------------------*/

describe('/api/teams/scrim-requests', () => {
  it('401 without token', async () => {
    const res = makeRes();
    await scrimRequestsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when user is not captain', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await scrimRequestsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(403);
  });

  it('GET 200 lists pending scrim demandes for captain team', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 't1',
        captain_id: 'user-1',
        is_active: true,
        name: 'A',
        logo_url: null,
      },
    ] as any;
    store.demandes = [
      {
        id: 'd1',
        team_id: 't1',
        type: 'scrim',
        status: 'pending',
        user_id: 'sender-1',
        comment: null,
        payload: null,
        created_at: '2026',
      },
      {
        id: 'd2',
        team_id: 't1',
        type: 'scrim',
        status: 'approved',
        user_id: null,
        created_at: '2026',
      },
    ] as any;
    // Auth-user enrichment now resolves through the batch
    // admin_get_user_profiles RPC (fed by setAuthListUsers).
    setAuthListUsers([{ id: 'sender-1', email: 'sender@example.com' }]);
    const res = makeRes();
    await scrimRequestsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const list = (res.body as any).demandes;
    expect(list.map((d: any) => d.id)).toEqual(['d1']);
    expect(list[0].user.email).toBe('sender@example.com');
  });

  it('POST 400 with invalid demandeId', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 't1', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: { demandeId: 'bogus', action: 'approve' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 with invalid action', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 't1', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: { demandeId: VALID_UUID, action: 'unknown' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when demande not found / not pending', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 't1', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    store.demandes = [];
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq(
        { method: 'POST', body: { demandeId: VALID_UUID, action: 'approve' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST approve: marks demande approved + creates a notification demande', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 't1', captain_id: 'user-1', is_active: true, name: 'Captain Team' },
    ] as any;
    store.demandes = [
      {
        id: VALID_UUID,
        team_id: 't1',
        type: 'scrim',
        status: 'pending',
        comment: 'Available friday',
        payload: {
          from_team_id: 'sender-team',
          from_team_name: 'Sender Team',
          preferred_date: '2026-04-15',
        },
      },
    ] as any;
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq(
        { method: 'POST', body: { demandeId: VALID_UUID, action: 'approve' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).newStatus).toBe('approved');
    const original = (store.demandes as any).find(
      (d: any) => d.id === VALID_UUID
    );
    expect(original.status).toBe('approved');
    // A notification demande should have been added
    const notif = (store.demandes as any).find(
      (d: any) => d.payload?.notification_type === 'scrim_accepted'
    );
    expect(notif).toBeTruthy();
  });

  it('POST reject: marks demande rejected, no notification created', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 't1', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    store.demandes = [
      {
        id: VALID_UUID,
        team_id: 't1',
        type: 'scrim',
        status: 'pending',
        payload: {},
      },
    ] as any;
    const before = (store.demandes as any).length;
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq(
        { method: 'POST', body: { demandeId: VALID_UUID, action: 'reject' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).newStatus).toBe('rejected');
    expect((store.demandes as any).length).toBe(before); // no notification added
  });

  it('returns 405 on unsupported method', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 't1', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    const res = makeRes();
    await scrimRequestsHandler(makeReq({ method: 'PATCH' }, true), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/teams (manager+)
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/teams', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('400 when id missing', async () => {
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq({ method: 'GET', query: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 lists tournament teams', async () => {
    store.tournament_teams = [
      {
        id: 'tt1',
        tournament_id: TID,
        team_id: 't1',
        seed: 1,
        status: 'registered',
        created_at: '2026',
        team: { id: 't1', name: 'Alpha', logo_url: null },
      },
    ] as any;
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq({ method: 'GET', query: { id: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).teams).toHaveLength(1);
  });

  it('POST 400 when team_id missing', async () => {
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq({ method: 'POST', query: { id: TID }, body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when tournament not found', async () => {
    store.tournaments = [];
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq(
        { method: 'POST', query: { id: TID }, body: { team_id: 't1' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST 404 when team not found', async () => {
    store.tournaments = [
      { id: TID, name: 'Cup', max_teams: null, min_players: null },
    ] as any;
    store.teams = [];
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq(
        { method: 'POST', query: { id: TID }, body: { team_id: 't1' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST 400 when team has fewer members than min_players', async () => {
    store.tournaments = [
      { id: TID, name: 'Cup', max_teams: null, min_players: 5 },
    ] as any;
    store.teams = [{ id: 't1', name: 'Alpha' }] as any;
    store.team_members = [
      { id: 'm1', team_id: 't1' },
      { id: 'm2', team_id: 't1' },
    ] as any;
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq(
        { method: 'POST', query: { id: TID }, body: { team_id: 't1' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when team already registered', async () => {
    store.tournaments = [
      { id: TID, name: 'Cup', max_teams: null, min_players: null },
    ] as any;
    store.teams = [{ id: 't1', name: 'Alpha' }] as any;
    store.tournament_teams = [
      { id: 'tt1', tournament_id: TID, team_id: 't1' },
    ] as any;
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq(
        { method: 'POST', query: { id: TID }, body: { team_id: 't1' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when tournament has reached max teams', async () => {
    store.tournaments = [
      { id: TID, name: 'Cup', max_teams: 1, min_players: null },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ] as any;
    store.tournament_teams = [
      { id: 'tt1', tournament_id: TID, team_id: 't2' },
    ] as any;
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq(
        { method: 'POST', query: { id: TID }, body: { team_id: 't1' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 registers and creates a news article', async () => {
    store.tournaments = [
      { id: TID, name: 'Cup', max_teams: null, min_players: null },
    ] as any;
    store.teams = [{ id: 't1', name: 'Alpha', logo_url: null }] as any;
    store.tournament_teams = [];
    store.news = [];

    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: TID },
          body: { team_id: 't1', seed: 4, status: 'registered' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.tournament_teams as any).length).toBe(1);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
    expect((store.news as any).length).toBe(1);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await tournamentTeamsHandler(
      makeReq({ method: 'PATCH', query: { id: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/tournaments/[id]/mvp-leaderboard (public)
 * ---------------------------------------------------------*/

describe('GET /api/tournaments/[id]/mvp-leaderboard', () => {
  it('405 on non-GET', async () => {
    const res = makeRes();
    await mvpLeaderboardHandler(
      makeReq({ method: 'POST', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await mvpLeaderboardHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when tournament missing', async () => {
    store.tournaments = [];
    const res = makeRes();
    await mvpLeaderboardHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 when tournament is not public', async () => {
    // La visibilité se lit sur `tournaments.visibility` — il n'existe pas de
    // colonne `is_public` sur cette table.
    store.tournaments = [
      { id: TID, name: 'Cup', visibility: 'private' },
    ] as any;
    const res = makeRes();
    await mvpLeaderboardHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 aggregates MVP counts per member', async () => {
    store.tournaments = [{ id: TID, name: 'Cup', visibility: 'public' }] as any;
    store.matches = [
      {
        id: 'm1',
        round_name: 'Final',
        completed_at: '2026-04-01T10:00:00Z',
        team1_id: 't1',
        team2_id: 't2',
        status: 'finished',
        tournament_id: TID,
        mvp: { winner_member_id: 'mem-A', winner_battle_tag: 'Alpha#1' },
      },
      {
        id: 'm2',
        round_name: 'Semi',
        completed_at: '2026-03-30T10:00:00Z',
        team1_id: 't1',
        team2_id: 't3',
        status: 'finished',
        tournament_id: TID,
        mvp: { winner_member_id: 'mem-A', winner_battle_tag: 'Alpha#1' },
      },
      {
        id: 'm3',
        round_name: 'Quarter',
        completed_at: '2026-03-28T10:00:00Z',
        team1_id: 't2',
        team2_id: 't4',
        status: 'finished',
        tournament_id: TID,
        mvp: null, // No MVP
      },
    ] as any;
    store.team_members = [
      { id: 'mem-A', team_id: 't1', battle_tag: 'Alpha#1' },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
      { id: 't3', name: 'Gamma' },
      { id: 't4', name: 'Delta' },
    ] as any;
    const res = makeRes();
    await mvpLeaderboardHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.totalFinishedMatches).toBe(3);
    expect(body.totalMvpAwards).toBe(2);
    expect(body.leaderboard[0].memberId).toBe('mem-A');
    expect(body.leaderboard[0].mvpCount).toBe(2);
    expect(body.leaderboard[0].teamName).toBe('Alpha');
  });

  it('200 with empty leaderboard when no MVP polls', async () => {
    store.tournaments = [{ id: TID, name: 'Cup', visibility: 'public' }] as any;
    store.matches = [];
    const res = makeRes();
    await mvpLeaderboardHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect((res.body as any).leaderboard).toEqual([]);
    expect((res.body as any).totalMvpAwards).toBe(0);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/export-results
 * ---------------------------------------------------------*/

describe('GET /api/admin/tournament/[id]/export-results', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
  });

  function seedExport() {
    store.tournaments = [
      { id: TID, name: 'Cup', slug: 'cup', game: 'OW2', status: 'completed' },
    ] as any;
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: TID,
        name: 'Group',
        stage_type: 'group',
        order_index: 0,
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: 's1',
        status: 'finished',
        round_number: 1,
        round_name: 'R1',
        bracket_side: null,
        team1_id: 't1',
        team2_id: 't2',
        team1_score: 2,
        team2_score: 1,
        winner_team_id: 't1',
        scheduled_at: '2026-04-01',
        completed_at: '2026-04-01',
        match_format: 'bo3',
        best_of: 3,
        is_bye: false,
      },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ] as any;
  }

  it('405 on non-GET', async () => {
    const res = makeRes();
    await exportResultsHandler(
      makeReq({ method: 'POST', query: { id: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await exportResultsHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when tournament missing', async () => {
    store.tournaments = [];
    const res = makeRes();
    await exportResultsHandler(
      makeReq({ method: 'GET', query: { id: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('exports CSV by default', async () => {
    seedExport();
    const res = makeRes();
    await exportResultsHandler(
      makeReq({ method: 'GET', query: { id: TID } }, true),
      res
    );
    expect(res.headers['Content-Type']).toMatch(/text\/csv/);
    const csv = res.endBody as string;
    expect(csv).toContain('match_id');
    expect(csv).toContain('Alpha');
    expect(csv).toContain('2-1'); // score
  });

  it('exports JSON when ?format=json', async () => {
    seedExport();
    const res = makeRes();
    await exportResultsHandler(
      makeReq({ method: 'GET', query: { id: TID, format: 'json' } }, true),
      res
    );
    expect(res.headers['Content-Type']).toMatch(/application\/json/);
    const json = JSON.parse(res.endBody as string);
    expect(json.tournament.name).toBe('Cup');
    expect(json.totalMatches).toBe(1);
  });
});
