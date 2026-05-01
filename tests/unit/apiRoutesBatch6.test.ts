import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import adminLogsHandler from '../../pages/api/admin/logs';
import stageStandingsHandler from '../../pages/api/admin/stages/[stageId]/standings';
import stageHistoryHandler from '../../pages/api/admin/stages/[stageId]/history';
import teamHistoryHandler from '../../pages/api/admin/teams/[teamId]/history';
import twitchChannelByIdHandler from '../../pages/api/admin/twitch-channels/[id]';

import { invalidateAllStandingsCache } from '../../utils/stages/standingsCache';

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
    ended: false,
    endBody: undefined as unknown,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = (b?: unknown) => ((res.ended = true), (res.endBody = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateAllStandingsCache();
});

/* -----------------------------------------------------------
 * /api/admin/logs
 * ---------------------------------------------------------*/

describe('GET /api/admin/logs', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await adminLogsHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 returns formatted logs', async () => {
    store.staff_logs = [
      {
        id: 'l1',
        created_at: '2026-04-01T10:00:00.000Z',
        staff_id: 'staff-1',
        action: 'login',
        entity_type: null,
        entity_id: null,
      },
      {
        id: 'l2',
        created_at: '2026-04-01T11:00:00.000Z',
        staff_id: 'staff-1',
        action: 'create_tournament',
        entity_type: 'tournament',
        entity_id: 'tour-1',
      },
    ] as any;
    const res = makeRes();
    await adminLogsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const logs = (res.body as any).logs;
    expect(logs).toHaveLength(2);
    expect(logs[0].readableAction).toBeTruthy();
  });

  it('filters by staffId', async () => {
    store.staff_logs = [
      { id: 'l1', staff_id: 'staff-1', action: 'login', created_at: '2026' },
      { id: 'l2', staff_id: 'staff-2', action: 'login', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminLogsHandler(
      makeReq({ method: 'GET', query: { staffId: 'staff-2' } }, true),
      res
    );
    const logs = (res.body as any).logs;
    expect(logs.map((l: any) => l.id)).toEqual(['l2']);
  });

  it('filters by entityType and action', async () => {
    store.staff_logs = [
      {
        id: 'l1',
        staff_id: 's1',
        action: 'create_match',
        entity_type: 'match',
        created_at: '2026',
      },
      {
        id: 'l2',
        staff_id: 's1',
        action: 'create_team',
        entity_type: 'team',
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await adminLogsHandler(
      makeReq(
        {
          method: 'GET',
          query: { entityType: 'match', action: 'create_match' },
        },
        true
      ),
      res
    );
    expect((res.body as any).logs.map((l: any) => l.id)).toEqual(['l1']);
  });

  it('filters by date range (from/to)', async () => {
    store.staff_logs = [
      {
        id: 'l1',
        created_at: '2026-04-01T10:00:00Z',
        action: 'login',
        staff_id: 's1',
      },
      {
        id: 'l2',
        created_at: '2026-04-05T10:00:00Z',
        action: 'login',
        staff_id: 's1',
      },
      {
        id: 'l3',
        created_at: '2026-04-10T10:00:00Z',
        action: 'login',
        staff_id: 's1',
      },
    ] as any;
    const res = makeRes();
    await adminLogsHandler(
      makeReq(
        {
          method: 'GET',
          query: { from: '2026-04-04', to: '2026-04-09' },
        },
        true
      ),
      res
    );
    expect((res.body as any).logs.map((l: any) => l.id)).toEqual(['l2']);
  });

  it('returns total count when includeTotal=1', async () => {
    store.staff_logs = [
      { id: 'l1', staff_id: 's1', action: 'login', created_at: '2026' },
      { id: 'l2', staff_id: 's1', action: 'login', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminLogsHandler(
      makeReq({ method: 'GET', query: { includeTotal: '1' } }, true),
      res
    );
    expect((res.body as any).total).toBe(2);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/standings
 * ---------------------------------------------------------*/

describe('GET /api/admin/stages/[stageId]/standings', () => {
  const stageId = '550e8400-e29b-41d4-a716-446655440400';

  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  function seedStandingsData() {
    store.tournament_stages = [
      {
        id: stageId,
        name: 'Group Phase',
        stage_type: 'group',
        tournament_id: 'tour-1',
        order_index: 0,
        settings: {},
      },
    ] as any;
    store.stage_teams = [
      {
        stage_id: stageId,
        team_id: 't1',
        seed: 1,
        team: { id: 't1', name: 'Alpha', short_name: null },
      },
      {
        stage_id: stageId,
        team_id: 't2',
        seed: 2,
        team: { id: 't2', name: 'Beta', short_name: null },
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: stageId,
        status: 'finished',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
        round_number: 1,
        is_bye: false,
      },
    ] as any;
  }

  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await stageStandingsHandler(
      makeReq({ method: 'POST', query: { stageId } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when stageId is invalid', async () => {
    const res = makeRes();
    await stageStandingsHandler(
      makeReq({ method: 'GET', query: { stageId: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when stage does not exist', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await stageStandingsHandler(
      makeReq({ method: 'GET', query: { stageId } }, true),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 returns standings + grouped for group stages', async () => {
    seedStandingsData();
    const res = makeRes();
    await stageStandingsHandler(
      makeReq({ method: 'GET', query: { stageId } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.stageType).toBe('group');
    expect(body.standings[0].teamId).toBe('t1');
    expect(body.grouped).toBeDefined();
  });

  it('exports CSV when ?export=csv', async () => {
    seedStandingsData();
    const res = makeRes();
    await stageStandingsHandler(
      makeReq({ method: 'GET', query: { stageId, export: 'csv' } }, true),
      res
    );
    expect(res.headers['Content-Type']).toMatch(/text\/csv/);
    expect(res.headers['Content-Disposition']).toContain('attachment');
    expect(typeof res.endBody).toBe('string');
    expect(res.endBody as string).toContain('rank');
  });

  it('exports JSON when ?export=json', async () => {
    seedStandingsData();
    const res = makeRes();
    await stageStandingsHandler(
      makeReq({ method: 'GET', query: { stageId, export: 'json' } }, true),
      res
    );
    expect(res.headers['Content-Type']).toMatch(/application\/json/);
    const exported = JSON.parse(res.endBody as string);
    expect(exported.standings).toBeDefined();
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/history — uses .contains()
 * ---------------------------------------------------------*/

describe('GET /api/admin/stages/[stageId]/history', () => {
  const stageId = '550e8400-e29b-41d4-a716-446655440500';

  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('returns 400 when stageId is invalid', async () => {
    const res = makeRes();
    await stageHistoryHandler(
      makeReq({ method: 'GET', query: { stageId: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await stageHistoryHandler(
      makeReq({ method: 'POST', query: { stageId } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('200 merges direct + payload-referenced logs', async () => {
    store.staff_logs = [
      {
        id: 'L1',
        entity_type: 'stage',
        entity_id: stageId,
        action: 'update_stage',
        created_at: '2026-04-01T11:00:00Z',
        staff_id: 'staff-1',
        payload: null,
      },
      {
        id: 'L2',
        entity_type: 'match',
        entity_id: 'm1',
        action: 'create_match',
        created_at: '2026-04-01T12:00:00Z',
        staff_id: 'staff-1',
        payload: { stage_id: stageId },
      },
      {
        id: 'L3',
        entity_type: 'match',
        entity_id: 'm2',
        action: 'create_match',
        created_at: '2026-04-01T09:00:00Z',
        staff_id: 'staff-1',
        payload: { stage_id: 'other-stage' },
      },
    ] as any;
    const res = makeRes();
    await stageHistoryHandler(
      makeReq({ method: 'GET', query: { stageId } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).logs.map((l: any) => l.id);
    // L1 (direct) + L2 (payload) — but NOT L3 (other stage)
    expect(ids.sort()).toEqual(['L1', 'L2']);
  });
});

/* -----------------------------------------------------------
 * /api/admin/teams/[teamId]/history
 * ---------------------------------------------------------*/

describe('GET /api/admin/teams/[teamId]/history', () => {
  const teamId = '550e8400-e29b-41d4-a716-446655440600';

  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('returns 400 when teamId is invalid', async () => {
    const res = makeRes();
    await teamHistoryHandler(
      makeReq({ method: 'GET', query: { teamId: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await teamHistoryHandler(
      makeReq({ method: 'POST', query: { teamId } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('200 merges direct + payload-referenced logs', async () => {
    store.staff_logs = [
      {
        id: 'L1',
        entity_type: 'team',
        entity_id: teamId,
        action: 'update_team',
        created_at: '2026-04-01T10:00:00Z',
        staff_id: 'staff-1',
        payload: null,
      },
      {
        id: 'L2',
        entity_type: 'tournament',
        entity_id: 'tour-1',
        action: 'register_team',
        created_at: '2026-04-01T11:00:00Z',
        staff_id: 'staff-1',
        payload: { team_id: teamId },
      },
    ] as any;
    const res = makeRes();
    await teamHistoryHandler(
      makeReq({ method: 'GET', query: { teamId } }, true),
      res
    );
    const ids = (res.body as any).logs.map((l: any) => l.id);
    expect(ids.sort()).toEqual(['L1', 'L2']);
  });
});

/* -----------------------------------------------------------
 * /api/admin/twitch-channels/[id]
 * ---------------------------------------------------------*/

describe('/api/admin/twitch-channels/[id]', () => {
  const id = '550e8400-e29b-41d4-a716-446655440700';

  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('returns 400 when id is invalid', async () => {
    const res = makeRes();
    await twitchChannelByIdHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 returns the channel when found', async () => {
    store.twitch_channels = [
      { id, channel: 'foo', label: 'Foo', is_active: true },
    ] as any;
    const res = makeRes();
    await twitchChannelByIdHandler(
      makeReq({ method: 'GET', query: { id } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).channel).toBe('foo');
  });

  it('GET 404 when channel does not exist', async () => {
    store.twitch_channels = [];
    const res = makeRes();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await twitchChannelByIdHandler(
      makeReq({ method: 'GET', query: { id } }, true),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(404);
  });

  it('PATCH 200 updates fields', async () => {
    store.twitch_channels = [
      { id, channel: 'old', label: 'Old', is_active: true },
    ] as any;
    const res = makeRes();
    await twitchChannelByIdHandler(
      makeReq(
        {
          method: 'PATCH',
          query: { id },
          body: { channel: '  NewName  ', isActive: false },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.twitch_channels[0] as any).channel).toBe('newname');
    expect((store.twitch_channels[0] as any).is_active).toBe(false);
  });

  it('DELETE 204 removes the row', async () => {
    store.twitch_channels = [{ id, channel: 'foo', label: 'Foo' }] as any;
    const res = makeRes();
    await twitchChannelByIdHandler(
      makeReq({ method: 'DELETE', query: { id } }, true),
      res
    );
    expect(res.statusCode).toBe(204);
    expect(store.twitch_channels.length).toBe(0);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await twitchChannelByIdHandler(
      makeReq({ method: 'POST', query: { id } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
