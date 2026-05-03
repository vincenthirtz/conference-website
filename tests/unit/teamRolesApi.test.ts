// Tests pour pages/api/admin/site-settings/team-roles.ts
//   - GET   : retourne la liste depuis site_settings (ou défauts si absent)
//   - PUT   : valide, normalise, persiste, log
//   - autre : 405

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
import { DEFAULT_TEAM_ROLES } from '../../utils/teamRoles';

import teamRolesHandler from '../../pages/api/admin/site-settings/team-roles';

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

describe('GET /api/admin/site-settings/team-roles', () => {
  it('returns default roles when no setting is stored', async () => {
    const res = makeRes();
    await teamRolesHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).roles).toEqual(DEFAULT_TEAM_ROLES);
  });

  it('returns the stored roles, parsed from JSON', async () => {
    store.site_settings = [
      {
        key: 'team_roles',
        value: JSON.stringify([
          { value: 'tank', label: 'Tank', permissions: ['manage_roster'] },
          { value: 'dps', label: 'DPS' },
        ]),
        description: null,
      },
    ] as any;

    const res = makeRes();
    await teamRolesHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).roles).toEqual([
      { value: 'tank', label: 'Tank', permissions: ['manage_roster'] },
      { value: 'dps', label: 'DPS', permissions: [] },
    ]);
  });

  it('falls back to defaults when stored value is invalid JSON', async () => {
    store.site_settings = [
      { key: 'team_roles', value: 'not-json', description: null },
    ] as any;

    const res = makeRes();
    await teamRolesHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).roles).toEqual(DEFAULT_TEAM_ROLES);
  });
});

describe('PUT /api/admin/site-settings/team-roles', () => {
  it('400 when roles is missing or not an array', async () => {
    const r1 = makeRes();
    await teamRolesHandler(
      makeAuthedReq({ method: 'PUT', body: {} }),
      r1
    );
    expect(r1.statusCode).toBe(400);

    const r2 = makeRes();
    await teamRolesHandler(
      makeAuthedReq({ method: 'PUT', body: { roles: 'player' } }),
      r2
    );
    expect(r2.statusCode).toBe(400);
  });

  it('400 when the array is empty', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({ method: 'PUT', body: { roles: [] } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when an entry is missing a value', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: { roles: [{ label: 'No value' }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when a value contains invalid characters', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: { roles: [{ value: 'has space', label: 'Bad' }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on duplicate values (case-insensitive)', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          roles: [
            { value: 'player', label: 'A' },
            { value: 'PLAYER', label: 'B' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 inserts a new site_settings row when none exists', async () => {
    store.site_settings = [];
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          roles: [
            { value: 'tank', label: 'Tank', permissions: ['manage_roster'] },
            { value: 'dps', label: 'DPS' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).roles).toEqual([
      { value: 'tank', label: 'Tank', permissions: ['manage_roster'] },
      { value: 'dps', label: 'DPS', permissions: [] },
    ]);
    const rows = store.site_settings as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe('team_roles');
    expect(JSON.parse(rows[0].value)).toEqual([
      { value: 'tank', label: 'Tank', permissions: ['manage_roster'] },
      { value: 'dps', label: 'DPS', permissions: [] },
    ]);
  });

  it('200 updates the existing site_settings row (upsert by key)', async () => {
    store.site_settings = [
      {
        key: 'team_roles',
        value: JSON.stringify([{ value: 'old', label: 'Old' }]),
        description: null,
      },
    ] as any;

    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          roles: [{ value: 'player', label: 'Player' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const rows = store.site_settings as any[];
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].value)).toEqual([
      { value: 'player', label: 'Player', permissions: [] },
    ]);
  });

  it('normalizes value to lowercase and fills missing label from value', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          roles: [
            { value: 'COACH' },
            { value: 'sub', label: '   ' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).roles).toEqual([
      { value: 'coach', label: 'Coach', permissions: [] },
      { value: 'sub', label: 'Sub', permissions: [] },
    ]);
  });

  it('400 when permissions contain an unknown value', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          roles: [
            {
              value: 'manager',
              label: 'Manager',
              permissions: ['manage_roster', 'totally_made_up'],
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toContain('Invalid permission');
  });

  it('deduplicates permissions and keeps catalog order in response', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          roles: [
            {
              value: 'manager',
              label: 'Manager',
              permissions: [
                'manage_scrims',
                'manage_roster',
                'manage_roster',
                'manage_team_info',
              ],
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).roles[0].permissions).toEqual([
      'manage_roster',
      'manage_team_info',
      'manage_scrims',
    ]);
  });

  it('treats missing permissions as empty array', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: {
          roles: [{ value: 'player', label: 'Player' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).roles[0].permissions).toEqual([]);
  });

  it('writes a staff_log entry with entity_id=team_roles', async () => {
    const res = makeRes();
    await teamRolesHandler(
      makeAuthedReq({
        method: 'PUT',
        body: { roles: [{ value: 'player', label: 'Player' }] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
    const calls = logStaffActionMock.mock.calls as unknown as Array<
      [
        {
          entity_type?: string;
          entity_id?: string | null;
          payload?: unknown;
        },
      ]
    >;
    const arg = calls[0]?.[0];
    expect(arg?.entity_type).toBe('site_settings');
    expect(arg?.entity_id).toBe('team_roles');
    expect(arg?.payload).toEqual({ count: 1 });
  });
});

describe('team-roles handler — other methods', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await teamRolesHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('405 on DELETE', async () => {
    const res = makeRes();
    await teamRolesHandler(makeAuthedReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });
});
