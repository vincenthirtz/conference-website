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
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import demandesCaptainHandler from '../../pages/api/demandes/captain';
import supportTicketByIdHandler from '../../pages/api/admin/support/tickets/[id]';
import bulkTeamsHandler from '../../pages/api/admin/teams/bulk';

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

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/demandes/captain
 * ---------------------------------------------------------*/

describe('/api/demandes/captain', () => {
  it('405 on unsupported methods', async () => {
    const res = makeRes();
    setAuthUser({ id: 'user-1' });
    await demandesCaptainHandler(makeReq({ method: 'PATCH' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 without Bearer token', async () => {
    const res = makeRes();
    await demandesCaptainHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET 200 returns own captain_request demandes', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [
      {
        id: 'd1',
        user_id: 'user-1',
        type: 'captain_request',
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
      {
        id: 'd3',
        user_id: 'other',
        type: 'captain_request',
        status: 'pending',
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await demandesCaptainHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).demandes.map((d: any) => d.id)).toEqual(['d1']);
  });

  it('POST 400 when body invalid (Zod schema)', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await demandesCaptainHandler(
      makeReq({ method: 'POST', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when an existing pending captain_request is already on file', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [
      {
        id: 'existing',
        user_id: 'user-1',
        type: 'captain_request',
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await demandesCaptainHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamName: 'New Team', members: [] },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).existingDemandeId).toBe('existing');
  });

  it('POST 400 when existingTeamId references unknown team', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [];
    store.teams = [];
    const res = makeRes();
    await demandesCaptainHandler(
      makeReq(
        {
          method: 'POST',
          body: { existingTeamId: VALID_UUID, members: [] },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 creates demande for new team', async () => {
    setAuthUser({ id: 'user-1', email: 'me@me.com', user_metadata: {} });
    store.demandes = [];
    const res = makeRes();
    await demandesCaptainHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            teamName: 'My New Team',
            members: [
              {
                email: 'a@a.com',
                battleTag: 'Player#1234',
                displayName: 'A',
                specialty: 'tank',
              },
            ],
            message: 'A motivation message',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = (store.demandes as any)[0];
    expect(created.type).toBe('captain_request');
    expect(created.payload.team_name).toBe('My New Team');
    expect(created.payload.members[0].email).toBe('a@a.com');
    // specialty is persisted into the demande payload (was dropped before).
    expect(created.payload.members[0].specialty).toBe('tank');
  });

  it('POST 201 persists null specialty when unspecified', async () => {
    setAuthUser({ id: 'user-1', email: 'me@me.com', user_metadata: {} });
    store.demandes = [];
    const res = makeRes();
    await demandesCaptainHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            teamName: 'Roster Team',
            members: [
              {
                email: 'b@b.com',
                battleTag: 'Player#5678',
                specialty: null,
              },
            ],
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = (store.demandes as any)[0];
    expect(created.payload.members[0].specialty).toBeNull();
  });

  it('POST 201 creates demande for existing team', async () => {
    setAuthUser({ id: 'user-1', email: 'me@me.com', user_metadata: {} });
    store.demandes = [];
    store.teams = [{ id: VALID_UUID, name: 'Existing Team' }] as any;
    const res = makeRes();
    await demandesCaptainHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            existingTeamId: VALID_UUID,
            members: [],
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = (store.demandes as any)[0];
    expect(created.team_id).toBe(VALID_UUID);
    expect(created.payload.existing_team_name).toBe('Existing Team');
  });
});

/* -----------------------------------------------------------
 * /api/admin/support/tickets/[id]
 * ---------------------------------------------------------*/

describe('/api/admin/support/tickets/[id]', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when ticket missing', async () => {
    store.support_tickets = [];
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq({ method: 'GET', query: { id: VALID_UUID } }, true),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns the ticket', async () => {
    store.support_tickets = [
      {
        id: VALID_UUID,
        status: 'open',
        severity: 'medium',
        category: 'dispute',
        message: 'msg',
      },
    ] as any;
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq({ method: 'GET', query: { id: VALID_UUID } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).ticket.id).toBe(VALID_UUID);
  });

  it('PATCH 400 with invalid status', async () => {
    store.support_tickets = [{ id: VALID_UUID, status: 'open' }] as any;
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq(
        {
          method: 'PATCH',
          query: { id: VALID_UUID },
          body: { status: 'bogus' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 when nothing to update', async () => {
    store.support_tickets = [{ id: VALID_UUID, status: 'open' }] as any;
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq({ method: 'PATCH', query: { id: VALID_UUID }, body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates status to resolved + sets resolved_at', async () => {
    store.support_tickets = [
      { id: VALID_UUID, status: 'open', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq(
        {
          method: 'PATCH',
          query: { id: VALID_UUID },
          body: { status: 'resolved', resolution_note: '  Fixed  ' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    const t = (store.support_tickets as any)[0];
    expect(t.status).toBe('resolved');
    expect(t.resolved_at).toBeTruthy();
    expect(t.resolution_note).toBe('  Fixed  ');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('PATCH 400 when resolution_note is non-string non-null', async () => {
    store.support_tickets = [{ id: VALID_UUID, status: 'open' }] as any;
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq(
        {
          method: 'PATCH',
          query: { id: VALID_UUID },
          body: { resolution_note: 12345 },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE 200 removes the ticket and logs', async () => {
    store.support_tickets = [{ id: VALID_UUID }] as any;
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq({ method: 'DELETE', query: { id: VALID_UUID } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.support_tickets.length).toBe(0);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on POST', async () => {
    const res = makeRes();
    await supportTicketByIdHandler(
      makeReq({ method: 'POST', query: { id: VALID_UUID } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/teams/bulk
 * ---------------------------------------------------------*/

describe('POST /api/admin/teams/bulk', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await bulkTeamsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when action missing', async () => {
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq({ method: 'POST', body: { teamIds: ['t1'] } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when teamIds empty', async () => {
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq(
        { method: 'POST', body: { action: 'delete', teamIds: [] } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when too many teams (>200)', async () => {
    const res = makeRes();
    const ids = Array.from({ length: 201 }, (_, i) => `t${i}`);
    await bulkTeamsHandler(
      makeReq(
        { method: 'POST', body: { action: 'delete', teamIds: ids } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on unknown action', async () => {
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq(
        {
          method: 'POST',
          body: { action: 'fly-to-mars', teamIds: ['t1'] },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 delete soft-deletes the matched teams', async () => {
    store.teams = [
      { id: 't1', name: 'A', is_active: true },
      { id: 't2', name: 'B', is_active: true },
      { id: 't3', name: 'C', is_active: true },
    ] as any;
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq(
        { method: 'POST', body: { action: 'delete', teamIds: ['t1', 't2'] } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).count).toBe(2);
    expect((store.teams[0] as any).is_active).toBe(false);
    expect((store.teams[0] as any).deleted_at).toBeTruthy();
    expect((store.teams[2] as any).is_active).toBe(true); // untouched
  });

  it('200 activate restores teams', async () => {
    store.teams = [
      { id: 't1', is_active: false, deleted_at: '2026-04-01' },
    ] as any;
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq(
        { method: 'POST', body: { action: 'activate', teamIds: ['t1'] } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams[0] as any).is_active).toBe(true);
    expect((store.teams[0] as any).deleted_at).toBeNull();
  });

  it('200 deactivate is symmetric to delete', async () => {
    store.teams = [{ id: 't1', is_active: true }] as any;
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq(
        { method: 'POST', body: { action: 'deactivate', teamIds: ['t1'] } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams[0] as any).is_active).toBe(false);
  });

  it('400 assign without tournamentId', async () => {
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq(
        { method: 'POST', body: { action: 'assign', teamIds: ['t1'] } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 assign when tournament not found', async () => {
    store.tournaments = [];
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            action: 'assign',
            teamIds: ['t1'],
            tournamentId: VALID_UUID,
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('logs the staff batch action on success', async () => {
    store.teams = [{ id: 't1', is_active: true }] as any;
    const res = makeRes();
    await bulkTeamsHandler(
      makeReq(
        { method: 'POST', body: { action: 'delete', teamIds: ['t1'] } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
    const args = (logStaffActionMock.mock.calls[0] as any[])[0];
    expect(args.action).toBe('staff_batch_action');
    expect(args.payload.action_label).toBe('bulk_delete');
  });
});
