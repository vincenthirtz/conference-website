// tests/unit/apiAdminRatings.test.ts
// /api/admin/ratings/coverage (GET) et /api/admin/ratings/rebuild (POST) —
// module features/admin/ratings.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock, rebuildRatingsMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(
    async (_entry: Record<string, unknown>) => undefined
  ),
  rebuildRatingsMock: vi.fn(async () => ({ players: 12, matches: 5 })),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));
vi.mock('@/utils/rating/applyMatchRating', () => ({
  rebuildRatings: rebuildRatingsMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import coverageHandler from '../../pages/api/admin/ratings/coverage';
import rebuildHandler from '../../pages/api/admin/ratings/rebuild';

const T = CONFERENCE_TENANT_ID;
const TEAM_A = '7c4f3a1b-2d5e-4f60-9b0c-1d2e3f4a5b61';
const TEAM_B = '7c4f3a1b-2d5e-4f60-9b0c-1d2e3f4a5b62';

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function makeReq(method: string): any {
  n += 1;
  return {
    method,
    headers: { host: 'h', authorization: `Bearer t-rating-${n}` },
    query: {},
    body: {},
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function finished(id: string, winner: string | null) {
  return {
    id,
    tenant_id: T,
    status: 'finished',
    is_bye: false,
    team1_id: TEAM_A,
    team2_id: TEAM_B,
    winner_team_id: winner,
    completed_at: '2026-07-31T20:00:00.000Z',
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  rebuildRatingsMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow()] as any;
  store.teams = [
    { id: TEAM_A, name: 'Phoenix', tenant_id: T },
    { id: TEAM_B, name: 'Dragons', tenant_id: T },
  ] as any;
});

describe('GET /api/admin/ratings/coverage', () => {
  it('distingue le match noté du match sans participants', async () => {
    store.matches = [finished('m-1', TEAM_A), finished('m-2', TEAM_B)] as any;
    store.player_rating_history = [{ match_id: 'm-1', tenant_id: T }] as any;
    store.match_participants = [] as any;

    const res = makeRes();
    await coverageHandler(makeReq('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, max-age=30');
    expect(res.body).toEqual({
      finished: 2,
      rated: 1,
      unrated: 1,
      samples: [
        {
          matchId: 'm-2',
          reason: 'no_participants',
          team1: 'Phoenix',
          team2: 'Dragons',
          completedAt: '2026-07-31T20:00:00.000Z',
        },
      ],
    });
  });

  it('405 avec Allow sur une autre méthode', async () => {
    const res = makeRes();
    await coverageHandler(makeReq('POST'), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});

describe('POST /api/admin/ratings/rebuild', () => {
  it('rejoue le classement du tenant et journalise', async () => {
    const res = makeRes();
    await rebuildHandler(makeReq('POST'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ players: 12, matches: 5 });
    expect(rebuildRatingsMock).toHaveBeenCalledWith(T);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    expect(logStaffActionMock.mock.calls[0][0]).toMatchObject({
      action: 'rebuild_ratings',
      entity_type: 'player_ratings',
      entity_id: null,
      tenant_id: T,
      payload: { operation: 'rating_rebuild', players: 12, matches: 5 },
    });
  });

  it('405 sur GET, rien de rejoué', async () => {
    const res = makeRes();
    await rebuildHandler(makeReq('GET'), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
    expect(rebuildRatingsMock).not.toHaveBeenCalled();
  });
});
