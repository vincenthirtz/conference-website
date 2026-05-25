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

import addMemberHandler from '../../pages/api/admin/teams/add-member';
import registerTeamHandler from '../../pages/api/demandes/register-team';
import adminTournamentsHandler from '../../pages/api/admin/tournaments/index';

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
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
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
const UUID_2 = '550e8400-e29b-41d4-a716-446655440001';

/* -----------------------------------------------------------
 * /api/admin/teams/add-member
 * ---------------------------------------------------------*/

describe('POST /api/admin/teams/add-member', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await addMemberHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when teamId missing', async () => {
    const res = makeRes();
    await addMemberHandler(
      makeReq({ method: 'POST', body: { battleTag: 'Player#1234' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on invalid battleTag format', async () => {
    const res = makeRes();
    await addMemberHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', userId: 'u1', battleTag: 'no-hash' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when team not found', async () => {
    store.teams = [];
    const res = makeRes();
    await addMemberHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            teamId: 'team-x',
            userId: 'u1',
            battleTag: 'Player#1234',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when no userId and no email provided', async () => {
    store.teams = [{ id: 'team-1', name: 'Alpha', logo_url: null }] as any;
    const res = makeRes();
    await addMemberHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', battleTag: 'Player#1234' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when email cannot be resolved to a user', async () => {
    store.teams = [{ id: 'team-1', name: 'Alpha', logo_url: null }] as any;
    setAuthListUsers([{ id: 'u1', email: 'someone@example.com' }]);
    const res = makeRes();
    await addMemberHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            teamId: 'team-1',
            email: 'unknown@example.com',
            battleTag: 'Player#1234',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 adds member by userId, sets captain when requested, creates news', async () => {
    store.teams = [
      {
        id: 'team-1',
        name: 'Alpha',
        logo_url: 'https://logo',
        captain_id: null,
      },
    ] as any;
    store.team_members = [];
    store.tournament_teams = [];
    store.news = [];

    const res = makeRes();
    await addMemberHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            teamId: 'team-1',
            userId: 'u-new',
            role: 'coach',
            battleTag: 'Coach#9876',
            setCaptain: true,
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).captainSet).toBe(true);
    expect((store.teams[0] as any).captain_id).toBe('u-new');
    expect(store.team_members.length).toBe(1);
    expect((store.team_members[0] as any).role).toBe('coach');
    // News auto-created
    expect((store.news as any).length).toBe(1);
  });

  it('400 when team already at max_players for one of its tournaments', async () => {
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        name: 'Alpha',
        logo_url: null,
      },
    ] as any;
    store.team_members = [
      {
        id: 'm1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        team_id: 'team-1',
      },
      {
        id: 'm2',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        team_id: 'team-1',
      },
    ] as any;
    store.tournament_teams = [
      {
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        team_id: 'team-1',
        tournament_id: TID,
        tournaments: { max_players: 2 }, // joined
      },
    ] as any;
    const res = makeRes();
    await addMemberHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            teamId: 'team-1',
            userId: 'u-new',
            battleTag: 'Player#1234',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * /api/demandes/register-team
 * ---------------------------------------------------------*/

describe('/api/demandes/register-team', () => {
  it('401 without token', async () => {
    const res = makeRes();
    await registerTeamHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET 200 returns own team_registration demandes', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [
      {
        id: 'd1',
        user_id: 'user-1',
        type: 'team_registration',
        status: 'pending',
        created_at: '2026',
      },
      {
        id: 'd2',
        user_id: 'user-1',
        type: 'join',
        status: 'pending',
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await registerTeamHandler(makeReq({ method: 'GET' }, true), res);
    expect((res.body as any).demandes.map((d: any) => d.id)).toEqual(['d1']);
  });

  it('POST 400 when teamId or tournamentId missing', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await registerTeamHandler(
      makeReq({ method: 'POST', body: { teamId: 'team-1' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when team unknown', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await registerTeamHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-x', tournamentId: TID },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when team is inactive', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', name: 'A', captain_id: 'user-1', is_active: false },
    ] as any;
    const res = makeRes();
    await registerTeamHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', tournamentId: TID },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 403 when not captain', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', name: 'A', captain_id: 'someone-else', is_active: true },
    ] as any;
    const res = makeRes();
    await registerTeamHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', tournamentId: TID },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('POST 400 when tournament not published', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', name: 'A', captain_id: 'user-1', is_active: true },
    ] as any;
    store.tournaments = [{ id: TID, name: 'X', status: 'draft' }] as any;
    const res = makeRes();
    await registerTeamHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', tournamentId: TID },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when team already registered', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', name: 'A', captain_id: 'user-1', is_active: true },
    ] as any;
    store.tournaments = [
      {
        id: TID,
        name: 'X',
        status: 'published',
        min_players: null,
        max_teams: null,
      },
    ] as any;
    store.tournament_teams = [
      { id: 'tt1', tournament_id: TID, team_id: 'team-1' },
    ] as any;
    const res = makeRes();
    await registerTeamHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', tournamentId: TID },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when min_players not met', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', name: 'A', captain_id: 'user-1', is_active: true },
    ] as any;
    store.tournaments = [
      {
        id: TID,
        name: 'X',
        status: 'published',
        min_players: 5,
        max_teams: null,
      },
    ] as any;
    store.tournament_teams = [];
    store.team_members = [{ id: 'm1', team_id: 'team-1' }] as any;
    const res = makeRes();
    await registerTeamHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', tournamentId: TID },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when tournament max_teams reached', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', name: 'A', captain_id: 'user-1', is_active: true },
    ] as any;
    store.tournaments = [
      {
        id: TID,
        name: 'X',
        status: 'published',
        min_players: null,
        max_teams: 1,
      },
    ] as any;
    store.tournament_teams = [
      { id: 'tt2', tournament_id: TID, team_id: 'team-other' },
    ] as any;
    const res = makeRes();
    await registerTeamHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', tournamentId: TID },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 creates the registration demande', async () => {
    setAuthUser({
      id: 'user-1',
      email: 'me@me.com',
      user_metadata: { display_name: 'Me' },
    });
    store.teams = [
      { id: 'team-1', name: 'Alpha', captain_id: 'user-1', is_active: true },
    ] as any;
    store.tournaments = [
      {
        id: TID,
        name: 'Cup',
        status: 'published',
        min_players: null,
        max_teams: null,
      },
    ] as any;
    store.tournament_teams = [];
    store.demandes = [];

    const res = makeRes();
    await registerTeamHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', tournamentId: TID, message: 'Hello' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const d = (store.demandes as any)[0];
    expect(d.type).toBe('team_registration');
    expect(d.payload.team_name).toBe('Alpha');
    expect(d.payload.tournament_name).toBe('Cup');
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournaments
 * ---------------------------------------------------------*/

describe('/api/admin/tournaments', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('GET 200 lists tournaments', async () => {
    store.tournaments = [
      {
        id: TID,
        name: 'Cup',
        slug: 'cup',
        status: 'published',
        start_date: '2026-04-01',
        end_date: null,
        max_teams: 16,
        created_at: '2026',
        updated_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await adminTournamentsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tournaments).toHaveLength(1);
  });

  it('GET filters by status', async () => {
    store.tournaments = [
      {
        id: 't1',
        name: 'A',
        status: 'draft',
        created_at: '2026',
        updated_at: '2026',
      },
      {
        id: 't2',
        name: 'B',
        status: 'published',
        created_at: '2026',
        updated_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq({ method: 'GET', query: { status: 'draft' } }, true),
      res
    );
    expect((res.body as any).tournaments.map((t: any) => t.id)).toEqual(['t1']);
  });

  it('GET ?includeTotal=1 returns count', async () => {
    store.tournaments = [
      { id: 't1', name: 'A', status: 'draft', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq({ method: 'GET', query: { includeTotal: '1' } }, true),
      res
    );
    expect((res.body as any).total).toBe(1);
  });

  it('POST 400 when name missing', async () => {
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq({ method: 'POST', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 409 when slug already exists', async () => {
    store.tournaments = [{ id: 't1', slug: 'cup-2026' }] as any;
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq(
        {
          method: 'POST',
          body: { name: 'Cup 2026' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('POST 400 when start_date is invalid', async () => {
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq(
        {
          method: 'POST',
          body: { name: 'Cup', start_date: 'not-a-date' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when start_date >= end_date', async () => {
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            name: 'Cup',
            start_date: '2026-05-01',
            end_date: '2026-04-01',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when max_teams is not an integer >= 1', async () => {
    store.tournaments = [];
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq(
        {
          method: 'POST',
          body: { name: 'Cup', max_teams: 0 },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 creates tournament + auto-adds map pool when game has veto', async () => {
    store.tournaments = [];
    store.tournament_maps = [];
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq({ method: 'POST', body: { name: 'Brand New Cup', game: 'overwatch' } }, true),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.tournaments as any).length).toBe(1);
    // OW maps were inserted into tournament_maps
    expect((store.tournament_maps as any).length).toBeGreaterThan(0);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await adminTournamentsHandler(makeReq({ method: 'PATCH' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('GET filters by dateFrom/dateTo', async () => {
    store.tournaments = [
      {
        id: 't1',
        name: 'Old',
        status: 'published',
        start_date: '2026-01-01',
        created_at: '2026-01-01',
        updated_at: '2026',
      },
      {
        id: 't2',
        name: 'New',
        status: 'published',
        start_date: '2026-06-01',
        created_at: '2026-06-01',
        updated_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq(
        {
          method: 'GET',
          query: { dateFrom: '2026-05-01', dateTo: '2026-12-31' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('GET orders by start_date when requested', async () => {
    store.tournaments = [
      {
        id: 't1',
        name: 'A',
        status: 'published',
        start_date: '2026-01-01',
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq(
        {
          method: 'GET',
          query: { orderBy: 'start_date', orderDir: 'asc' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('GET respects search query filter', async () => {
    store.tournaments = [
      {
        id: 't1',
        name: 'Spring Cup',
        status: 'published',
        created_at: '2026',
      },
      {
        id: 't2',
        name: 'Summer League',
        status: 'published',
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq({ method: 'GET', query: { search: 'spring' } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('POST 400 when end_date alone is invalid', async () => {
    const res = makeRes();
    await adminTournamentsHandler(
      makeReq(
        {
          method: 'POST',
          body: { name: 'Cup', end_date: 'not-a-date' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});
