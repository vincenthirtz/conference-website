// Sweep 1c: heaviest admin handlers at 0% coverage.
//
// Targets:
//  - pages/api/admin/teams/[teamId]/members.ts (~416 lines)
//  - pages/api/admin/tournament/[id]/auto-schedule.ts (~250 lines)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

// We keep `sendTeamJoinEmail` and `sendWelcomeEmail` mocked because the real
// implementations call fetch (Brevo) and would error in tests. We do NOT mock
// `find-or-create-user` here — under vitest --no-isolate, file-level vi.mock
// can leak across files and break sibling test files that exercise the real
// implementation. Instead we drive behavior through the supabaseAdmin mock's
// listUsers/createUser state.
const { sendTeamJoinEmail, sendWelcomeEmail, autoScheduleMatches } = vi.hoisted(
  () => ({
    sendTeamJoinEmail: vi.fn(async () => undefined),
    sendWelcomeEmail: vi.fn(async () => ({ success: true as const })),
    autoScheduleMatches: vi.fn<(...args: any[]) => any>(() => ({
      scheduled: [],
      unscheduledMatchIds: [],
      conflicts: [],
    })),
  })
);

vi.mock('@/utils/email', () => ({ sendTeamJoinEmail, sendWelcomeEmail }));
vi.mock('@/utils/matches/autoScheduler', () => ({
  autoScheduleMatches,
  makeMultiDayWindows: (
    startDay: string,
    days: number,
    startT: string,
    endT: string
  ) => {
    const out: Array<{ start: Date; end: Date }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(`${startDay}T${startT}:00.000Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const e = new Date(`${startDay}T${endT}:00.000Z`);
      e.setUTCDate(e.getUTCDate() + i);
      out.push({ start: d, end: e });
    }
    return out;
  },
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
  setRpcResult,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

import membersHandler from '../../pages/api/admin/teams/[teamId]/members';
import autoScheduleHandler from '../../pages/api/admin/tournament/[id]/auto-schedule';

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

const TEAM_UUID = '11111111-1111-1111-1111-111111111111';
const TOUR_UUID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendTeamJoinEmail.mockClear();
  sendWelcomeEmail.mockClear();
  autoScheduleMatches.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * /api/admin/teams/[teamId]/members
 * ---------------------------------------------------------*/

describe('/api/admin/teams/[teamId]/members', () => {
  it('400 on invalid teamId', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({ method: 'GET', query: { teamId: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET returns empty list', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({ method: 'GET', query: { teamId: TEAM_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).members).toEqual([]);
  });

  it('GET returns existing members', async () => {
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: TEAM_UUID,
        user_id: 'u1',
        role: 'player',
        battle_tag: 'a#1234',
        is_substitute: false,
        created_at: '2026-04-01',
      },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({ method: 'GET', query: { teamId: TEAM_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).members.length).toBe(1);
  });

  // L'encadrement (coach / manager) n'a pas forcément de BattleTag : sans
  // display_name la ligne s'affichait vide dans /admin/teams/[id]/edit.
  it('GET exposes display_name, falling back to the auth profile', async () => {
    store.team_members = [
      {
        id: 'tm-coach',
        tenant_id: DEFAULT_TENANT_ID,
        team_id: TEAM_UUID,
        user_id: 'u-coach',
        role: 'coach',
        battle_tag: null,
        display_name: null,
        is_substitute: false,
        created_at: '2026-04-01',
      },
      {
        id: 'tm-player',
        tenant_id: DEFAULT_TENANT_ID,
        team_id: TEAM_UUID,
        user_id: 'u-player',
        role: 'player',
        battle_tag: 'Alice#1234',
        display_name: 'Alice roster',
        is_substitute: false,
        created_at: '2026-04-02',
      },
    ] as any;
    setRpcResult('admin_get_user_profiles', {
      data: [{ id: 'u-coach', display_name: 'Coach Nyo', email: null }],
    });

    const res = makeRes();
    await membersHandler(
      makeAuthedReq({ method: 'GET', query: { teamId: TEAM_UUID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const byId = new Map(
      (res.body as any).members.map((m: any) => [m.id, m.display_name])
    );
    // Sans display_name en roster → nom du compte.
    expect(byId.get('tm-coach')).toBe('Coach Nyo');
    // Avec display_name en roster → il prime, pas d'appel de repli.
    expect(byId.get('tm-player')).toBe('Alice roster');
  });

  // POST
  it('POST 400 when battleTag missing', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: { email: 'x@y.com' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 on invalid battleTag format', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: { email: 'x@y.com', battleTag: 'invalid' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when team not found', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: { email: 'x@y.com', battleTag: 'Player#1234' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST 400 when no userId or email', async () => {
    store.teams = [{ id: TEAM_UUID, name: 'Alpha' }] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: { battleTag: 'Player#1234' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST creates a member by email and sends join email', async () => {
    store.teams = [{ id: TEAM_UUID, name: 'Alpha' }] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: { email: 'new@y.com', battleTag: 'Player#1234' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    // The real findOrCreateUserByEmail flowed through the supabaseAdmin auth
    // mock and got back an id. emailed asynchronously — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    // 4e argument : l'espace au nom duquel l'email part (compte d'envoi +
    // marque). Sans lui, une équipe d'un autre tenant recevrait un email
    // signé de l'association et expédié depuis SON compte Brevo.
    expect(sendTeamJoinEmail).toHaveBeenCalledWith(
      'new@y.com',
      'Alpha',
      'player',
      DEFAULT_TENANT_ID
    );
  });

  // Régression : `team_members.tenant_id` est NOT NULL sans default en base
  // (enforce_tenant_id_not_null_and_fk.sql). Le handler l'omettait → 23502 →
  // 400 « Failed to add member » sur TOUT ajout via cet endpoint.
  it('POST stamps tenant_id on the inserted member', async () => {
    store.teams = [{ id: TEAM_UUID, name: 'Alpha' }] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: { email: 'tenant@y.com', role: 'manager' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.team_members as any)[0].tenant_id).toBe(DEFAULT_TENANT_ID);
  });

  it('POST creates a member by userId and sets captain', async () => {
    store.teams = [{ id: TEAM_UUID, name: 'Alpha', captain_id: null }] as any;
    setAdminUser('user-direct', 'direct@y.com');
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: {
          userId: 'user-direct',
          battleTag: 'Captain#1234',
          setCaptain: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).info).toContain('captain');
    // captain_id was updated
    expect((store.teams as any[])[0].captain_id).toBe('user-direct');
  });

  it('POST 409 when roster locked (no force)', async () => {
    store.teams = [
      {
        id: TEAM_UUID,
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        name: 'Alpha',
      },
    ] as any;
    store.tournament_teams = [
      {
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        team_id: TEAM_UUID,
        tournament_id: TOUR_UUID,
      },
    ] as any;
    store.tournaments = [
      {
        id: TOUR_UUID,
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        name: 'Cup',
        status: 'live',
        roster_locked_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: {
          email: 'x@y.com',
          battleTag: 'Player#1234',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('POST passes through with force=true even when locked', async () => {
    store.teams = [{ id: TEAM_UUID, name: 'Alpha' }] as any;
    store.tournament_teams = [
      { team_id: TEAM_UUID, tournament_id: TOUR_UUID },
    ] as any;
    store.tournaments = [
      {
        id: TOUR_UUID,
        name: 'Cup',
        status: 'live',
        roster_locked_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'POST',
        query: { teamId: TEAM_UUID },
        body: {
          email: 'x@y.com',
          battleTag: 'Player#1234',
          force: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
  });

  // PATCH
  it('PATCH 400 when memberId missing', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 when no fields to update', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'mem-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 on invalid battleTag', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'mem-1', battleTag: 'bad' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH allows only-battleTag change even when locked', async () => {
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: TEAM_UUID,
        user_id: 'u1',
        role: 'player',
        battle_tag: 'old#1234',
        is_substitute: false,
        created_at: '2026-04-01',
      },
    ] as any;
    store.tournament_teams = [
      { team_id: TEAM_UUID, tournament_id: TOUR_UUID },
    ] as any;
    store.tournaments = [
      {
        id: TOUR_UUID,
        status: 'live',
        roster_locked_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'tm1', battleTag: 'New#1234' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('PATCH updates role + isSubstitute', async () => {
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: TEAM_UUID,
        user_id: 'u1',
        role: 'player',
        battle_tag: 'old#1234',
        is_substitute: false,
        created_at: '2026-04-01',
      },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: {
          memberId: 'tm1',
          role: 'coach',
          isSubstitute: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).member.role).toBe('coach');
    expect((res.body as any).member.is_substitute).toBe(true);
  });

  it('PATCH clears battle_tag when empty string', async () => {
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: TEAM_UUID,
        user_id: 'u1',
        role: 'player',
        battle_tag: 'x#1234',
        is_substitute: false,
        created_at: '2026-04-01',
      },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'tm1', battleTag: '' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('PATCH 404 when member not found', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'nope', role: 'support' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('PATCH swap exchanges is_substitute between two members', async () => {
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: TEAM_UUID,
        user_id: 'u1',
        role: 'player',
        battle_tag: 'a#1234',
        is_substitute: false,
        created_at: '2026-04-01',
      },
      { id: 'tm2', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: TEAM_UUID,
        user_id: 'u2',
        role: 'player',
        battle_tag: 'b#1234',
        is_substitute: true,
        created_at: '2026-04-02',
      },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: {
          memberId: 'tm1',
          swapWithMemberId: 'tm2',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
  });

  it('PATCH swap 404 when member missing', async () => {
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: TEAM_UUID,
        user_id: 'u1',
        role: 'player',
        battle_tag: 'a#1234',
        is_substitute: false,
        created_at: '2026-04-01',
      },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'tm1', swapWithMemberId: 'unknown' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  // DELETE
  it('DELETE 400 when memberId missing', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'DELETE',
        query: { teamId: TEAM_UUID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE 404 when member not found', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'DELETE',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE removes a member', async () => {
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: TEAM_UUID,
        user_id: 'u1',
        role: 'player',
        is_substitute: false,
      },
    ] as any;
    store.teams = [{ id: TEAM_UUID, name: 'Alpha', captain_id: null }] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'DELETE',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'tm1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.team_members?.length).toBe(0);
  });

  it('DELETE clears captain_id when removing captain', async () => {
    store.team_members = [
      {
        id: 'tm-cap',
        team_id: TEAM_UUID,
        user_id: 'cap-user',
        role: 'player',
        is_substitute: false,
      },
    ] as any;
    store.teams = [
      { id: TEAM_UUID, name: 'Alpha', captain_id: 'cap-user' },
    ] as any;
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({
        method: 'DELETE',
        query: { teamId: TEAM_UUID },
        body: { memberId: 'tm-cap' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams as any[])[0].captain_id).toBe(null);
  });

  it('405 on PUT', async () => {
    const res = makeRes();
    await membersHandler(
      makeAuthedReq({ method: 'PUT', query: { teamId: TEAM_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/auto-schedule
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/auto-schedule', () => {
  it('400 on invalid id', async () => {
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({ method: 'POST', query: { id: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on GET', async () => {
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({ method: 'GET', query: { id: TOUR_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 when no windows provided', async () => {
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when windows array invalid (end <= start)', async () => {
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          windows: [
            {
              start: '2026-04-29T20:00:00.000Z',
              end: '2026-04-29T18:00:00.000Z',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 with no matches to schedule returns empty result', async () => {
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          windows: [
            {
              start: '2026-04-29T18:00:00.000Z',
              end: '2026-04-29T22:00:00.000Z',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scheduled).toEqual([]);
  });

  it('200 schedules matches via autoScheduler', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOUR_UUID,
        stage_id: null,
        status: 'pending',
        is_bye: false,
        match_format: 'bo3',
        round_number: 1,
        scheduled_at: null,
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    autoScheduleMatches.mockReturnValueOnce({
      scheduled: [
        {
          matchId: 'm1',
          resourceId: 'default',
          startAt: '2026-04-29T19:00:00.000Z',
          endAt: '2026-04-29T19:45:00.000Z',
          format: 'bo3' as const,
        },
      ],
      unscheduledMatchIds: [],
      conflicts: [],
    });
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          windows: [
            {
              start: '2026-04-29T18:00:00.000Z',
              end: '2026-04-29T22:00:00.000Z',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scheduled.length).toBe(1);
  });

  it('200 with startDay/startTime/endTime config builds windows', async () => {
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          startDay: '2026-04-29',
          daysCount: 2,
          startTime: '18:00',
          endTime: '22:00',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('200 with warnings when scheduled match falls outside tournament dates', async () => {
    store.tournaments = [
      {
        id: TOUR_UUID,
        start_date: '2026-04-30',
        end_date: '2026-05-01',
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOUR_UUID,
        stage_id: null,
        status: 'pending',
        is_bye: false,
        match_format: 'bo3',
        round_number: 1,
        scheduled_at: null,
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    autoScheduleMatches.mockReturnValueOnce({
      scheduled: [
        {
          matchId: 'm1',
          resourceId: 'default',
          startAt: '2026-04-29T19:00:00.000Z',
          endAt: '2026-04-29T20:00:00.000Z',
          format: 'bo3' as const,
        },
      ],
      unscheduledMatchIds: [],
      conflicts: [],
    });
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          windows: [
            {
              start: '2026-04-29T18:00:00.000Z',
              end: '2026-04-29T22:00:00.000Z',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).warnings).toBeDefined();
  });

  it('200 includes locked already-scheduled matches without re-scheduling them', async () => {
    store.matches = [
      {
        id: 'm-locked',
        tournament_id: TOUR_UUID,
        stage_id: null,
        status: 'pending',
        is_bye: false,
        match_format: 'bo3',
        round_number: 1,
        scheduled_at: '2026-04-29T18:00:00.000Z',
        team1_id: 't1',
        team2_id: 't2',
      },
      {
        id: 'm-bye',
        tournament_id: TOUR_UUID,
        status: 'pending',
        is_bye: true,
        match_format: null,
        round_number: 1,
        scheduled_at: null,
        team1_id: 't3',
        team2_id: null,
      },
      {
        id: 'm-fresh',
        tournament_id: TOUR_UUID,
        stage_id: null,
        status: 'pending',
        is_bye: false,
        match_format: 'bo1',
        round_number: 1,
        scheduled_at: null,
        team1_id: 't4',
        team2_id: 't5',
      },
    ] as any;
    autoScheduleMatches.mockImplementationOnce((matches: any[]) => {
      // Confirm locked match was forwarded
      const locked = matches.find((m: any) => m.locked === true);
      expect(locked?.id).toBe('m-locked');
      return {
        scheduled: [],
        unscheduledMatchIds: ['m-fresh'],
        conflicts: [],
      };
    });
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          windows: [
            {
              start: '2026-04-29T18:00:00.000Z',
              end: '2026-04-29T22:00:00.000Z',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).unscheduledMatchIds).toContain('m-fresh');
  });

  it('409 SCHEDULE_CONFLICTS_REQUIRE_CONFIRMATION when scheduler returns conflicts without acceptConflicts', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOUR_UUID,
        stage_id: null,
        status: 'pending',
        is_bye: false,
        match_format: 'bo3',
        round_number: 1,
        scheduled_at: null,
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    autoScheduleMatches.mockReturnValueOnce({
      scheduled: [
        {
          matchId: 'm1',
          resourceId: 'default',
          startAt: '2026-04-29T19:00:00.000Z',
          endAt: '2026-04-29T19:45:00.000Z',
          format: 'bo3' as const,
        },
      ],
      unscheduledMatchIds: [],
      conflicts: [
        {
          matchId1: 'm1',
          matchId2: 'm-other',
          teamId: 't1',
          overlapStart: '2026-04-29T19:00:00.000Z',
          overlapEnd: '2026-04-29T19:30:00.000Z',
        },
      ],
    });
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          windows: [
            {
              start: '2026-04-29T18:00:00.000Z',
              end: '2026-04-29T22:00:00.000Z',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).detail).toBe(
      'SCHEDULE_CONFLICTS_REQUIRE_CONFIRMATION'
    );
    expect((res.body as any).conflicts?.length).toBe(1);
    // Pas d'ecriture dans matches
    expect((store.matches as any[])[0].scheduled_at).toBeNull();
  });

  it('200 applies the schedule when acceptConflicts=true is passed', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOUR_UUID,
        stage_id: null,
        status: 'pending',
        is_bye: false,
        match_format: 'bo3',
        round_number: 1,
        scheduled_at: null,
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    autoScheduleMatches.mockReturnValueOnce({
      scheduled: [
        {
          matchId: 'm1',
          resourceId: 'default',
          startAt: '2026-04-29T19:00:00.000Z',
          endAt: '2026-04-29T19:45:00.000Z',
          format: 'bo3' as const,
        },
      ],
      unscheduledMatchIds: [],
      conflicts: [
        {
          matchId1: 'm1',
          matchId2: 'm-other',
          teamId: 't1',
          overlapStart: '2026-04-29T19:00:00.000Z',
          overlapEnd: '2026-04-29T19:30:00.000Z',
        },
      ],
    });
    const res = makeRes();
    await autoScheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          acceptConflicts: true,
          windows: [
            {
              start: '2026-04-29T18:00:00.000Z',
              end: '2026-04-29T22:00:00.000Z',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).conflicts?.length).toBe(1);
    // scheduled_at a ete ecrit
    expect((store.matches as any[])[0].scheduled_at).toBe(
      '2026-04-29T19:00:00.000Z'
    );
  });
});
