// Unit tests for GET /api/admin/scrims/calendar (agenda events in a range).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const logStaffActionMock = vi.fn(async () => undefined);
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import type { StaffMember } from '../../utils/staff';
import calendarHandler from '../../pages/api/admin/scrims/calendar';

const TEAM_A = '550e8400-e29b-41d4-a716-4466554400b1';
const TEAM_B = '550e8400-e29b-41d4-a716-4466554400b2';

function makeStaffRow(role: 'manager' = 'manager'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  } as StaffMember;
}

let _tok = 0;
function makeReq(over: Partial<any> = {}, auth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (auth) headers.authorization = `Bearer t-${Date.now()}-${(_tok += 1)}`;
  return { method: 'GET', headers, query: {}, body: {}, ...over };
}
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => (res.headers[k] = v);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.teams = [
    { id: TEAM_A, name: 'Phoenix' },
    { id: TEAM_B, name: 'Dragons' },
  ] as any;
});

describe('GET /api/admin/scrims/calendar', () => {
  it('401 without token', async () => {
    const res = makeRes();
    await calendarHandler(makeReq({}, false), res);
    expect(res.statusCode).toBe(401);
  });

  it('400 when from/to missing or invalid', async () => {
    const res = makeRes();
    await calendarHandler(makeReq({ query: { from: 'x', to: 'y' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('200 returns scrims + matches in range with team names', async () => {
    store.scrims = [
      {
        id: 's1',
        name: 'Phoenix vs Dragons',
        status: 'scheduled',
        scheduled_date: '2026-08-02T18:00:00.000Z',
        duration_minutes: 90,
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        deleted_at: null,
      },
      // Hors plage → exclu.
      {
        id: 's2',
        name: 'later',
        status: 'scheduled',
        scheduled_date: '2026-09-01T18:00:00.000Z',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        deleted_at: null,
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        status: 'pending',
        scheduled_at: '2026-08-03T20:00:00.000Z',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
      },
    ] as any;

    const res = makeRes();
    await calendarHandler(
      makeReq({
        query: {
          from: '2026-08-01T00:00:00.000Z',
          to: '2026-08-08T00:00:00.000Z',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.scrims).toHaveLength(1);
    expect(body.scrims[0].id).toBe('s1');
    expect(body.scrims[0].duration_minutes).toBe(90);
    expect(body.scrims[0].team1Name).toBe('Phoenix');
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].team2Name).toBe('Dragons');
  });
});
