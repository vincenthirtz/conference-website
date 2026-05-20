// Sweep 1a: small admin handlers at 0% coverage.
//
// Targets:
//  - pages/api/admin/site-settings/index.ts
//  - pages/api/admin/tournament/[id]/checkin.ts
//  - pages/api/admin/tournament/[id]/discord-test.ts
//  - pages/api/admin/tournament/[id]/history.ts
//  - pages/api/admin/tournament/[id]/dashboard.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const {
  postToDiscordWebhook,
  listCheckinStatus,
  processCheckinForUpcomingMatches,
  fetchDashboardData,
} = vi.hoisted(() => ({
  postToDiscordWebhook: vi.fn(async () => undefined),
  listCheckinStatus: vi.fn(async () => [{ id: 'm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', status: 'ok' }]),
  processCheckinForUpcomingMatches: vi.fn(async () => ({
    scanned: 5,
    acted: 2,
    errors: 0,
  })),
  fetchDashboardData: vi.fn(async () => ({
    ok: true as const,
    data: { tournament: { id: 'tour-1' } } as any,
  })),
}));

vi.mock('@/utils/discord', () => ({ postToDiscordWebhook }));
vi.mock('@/utils/checkin', () => ({
  listCheckinStatus,
  processCheckinForUpcomingMatches,
}));
vi.mock('@/utils/dashboard/buildTournamentDashboard', () => ({
  fetchDashboardData,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import siteSettingsHandler from '../../pages/api/admin/site-settings/index';
import checkinHandler from '../../pages/api/admin/tournament/[id]/checkin';
import discordTestHandler from '../../pages/api/admin/tournament/[id]/discord-test';
import historyHandler from '../../pages/api/admin/tournament/[id]/history';
import dashboardHandler from '../../pages/api/admin/tournament/[id]/dashboard';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

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

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  postToDiscordWebhook.mockClear();
  listCheckinStatus.mockClear();
  processCheckinForUpcomingMatches.mockClear();
  fetchDashboardData.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * /api/admin/site-settings
 * ---------------------------------------------------------*/

describe('/api/admin/site-settings', () => {
  it('GET returns settings sorted by key', async () => {
    store.site_settings = [
      { key: 'b', value: '2', description: null, updated_at: '2026-01-01' },
      { key: 'a', value: '1', description: null, updated_at: '2026-01-01' },
    ] as any;
    const res = makeRes();
    await siteSettingsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items).toHaveLength(2);
  });

  it('POST creates a new setting (happy path with stubbed upsert)', async () => {
    // The shared mock's upsert intentionally returns empty for follow-up
    // .select().single(). Inject a one-shot from() override so we can exercise
    // the success branch (logStaffAction + 200).
    const originalFrom = supabaseAdmin.from;
    const stubbedRow = {
      key: 'foo',
      value: 'bar',
      description: 'note',
      updated_at: '2026-04-29T00:00:00.000Z',
      updated_by: 'staff-1',
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'site_settings') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: stubbedRow, error: null }),
            }),
          }),
        };
      }
      return originalFrom(table);
    };

    try {
      const res = makeRes();
      await siteSettingsHandler(
        makeAuthedReq({
          method: 'POST',
          body: { key: 'foo', value: 'bar', description: 'note' },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(stubbedRow);
    } finally {
      (supabaseAdmin as any).from = originalFrom;
    }
  });

  it('POST 500 when upsert returns error', async () => {
    // Default mock yields {data: null, error: 'No row matched'} for
    // upsert().select().single() — exercises the error branch.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await siteSettingsHandler(
      makeAuthedReq({
        method: 'POST',
        body: { key: 'foo', value: 'bar' },
      }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });

  it('POST 400 when key missing', async () => {
    const res = makeRes();
    await siteSettingsHandler(
      makeAuthedReq({ method: 'POST', body: { value: 'x' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when value missing', async () => {
    const res = makeRes();
    await siteSettingsHandler(
      makeAuthedReq({ method: 'POST', body: { key: 'foo' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on PUT', async () => {
    const res = makeRes();
    await siteSettingsHandler(makeAuthedReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('403 when role below admin', async () => {
    store.staff = [makeStaffRow('manager')] as any;
    const res = makeRes();
    await siteSettingsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/checkin
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/checkin', () => {
  it('400 when id is invalid', async () => {
    const res = makeRes();
    await checkinHandler(
      makeAuthedReq({ method: 'GET', query: { id: 'not-a-uuid' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET returns matches', async () => {
    const res = makeRes();
    await checkinHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).matches).toBeDefined();
    // S5a: listCheckinStatus(tenantId, tournamentId)
    expect(listCheckinStatus).toHaveBeenCalledWith(
      'ce69a726-773e-4d12-b5eb-d2503aa752b4',
      VALID_UUID
    );
  });

  it('POST runs the manual processor and logs', async () => {
    const res = makeRes();
    await checkinHandler(
      makeAuthedReq({ method: 'POST', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
    expect(processCheckinForUpcomingMatches).toHaveBeenCalled();
    // staff_logs should have been written
    expect((store.staff_logs || []).length).toBeGreaterThan(0);
  });

  it('500 when processor throws', async () => {
    processCheckinForUpcomingMatches.mockRejectedValueOnce(new Error('boom'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await checkinHandler(
      makeAuthedReq({ method: 'POST', query: { id: VALID_UUID } }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });

  it('405 on PATCH', async () => {
    const res = makeRes();
    await checkinHandler(
      makeAuthedReq({ method: 'PATCH', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/discord-test
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/discord-test', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: 'not-uuid' },
        body: { channelType: 'match_results' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on invalid channelType', async () => {
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: VALID_UUID },
        body: { channelType: 'unknown' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when no webhook configured', async () => {
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: VALID_UUID },
        body: { channelType: 'match_results' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 when scoped webhook exists, posts to discord', async () => {
    store.discord_webhooks = [
      {
        id: 'w1',
        tournament_id: VALID_UUID,
        channel_type: 'match_results',
        webhook_url: 'https://disc/abc',
        role_mention: null,
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: VALID_UUID },
        body: { channelType: 'match_results' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(postToDiscordWebhook).toHaveBeenCalled();
  });

  it('200 falls back to global webhook when no scoped one', async () => {
    store.discord_webhooks = [
      {
        id: 'w-global',
        tournament_id: null,
        channel_type: 'bracket_updates',
        webhook_url: 'https://disc/global',
        role_mention: null,
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await discordTestHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: VALID_UUID },
        body: { channelType: 'bracket_updates' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(postToDiscordWebhook).toHaveBeenCalled();
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/history
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/history', () => {
  it('400 on invalid id', async () => {
    const res = makeRes();
    await historyHandler(
      makeAuthedReq({ method: 'GET', query: { id: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await historyHandler(
      makeAuthedReq({ method: 'POST', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('GET returns formatted logs', async () => {
    store.staff_logs = [
      {
        id: 'log-1',
        created_at: '2026-04-01T00:00:00.000Z',
        staff_id: 'staff-1',
        action: 'update_tournament',
        entity_type: 'tournament',
        entity_id: VALID_UUID,
        tournament_id: VALID_UUID,
        payload: {},
      },
    ] as any;
    const res = makeRes();
    await historyHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tournamentId).toBe(VALID_UUID);
    expect((res.body as any).logs).toBeDefined();
  });

  it('GET respects entityType filter', async () => {
    store.staff_logs = [
      {
        id: 'log-1',
        created_at: '2026-04-01T00:00:00.000Z',
        staff_id: 'staff-1',
        action: 'update_match',
        entity_type: 'match',
        entity_id: 'm1',
        tournament_id: VALID_UUID,
        payload: {},
      },
      {
        id: 'log-2',
        created_at: '2026-04-02T00:00:00.000Z',
        staff_id: 'staff-1',
        action: 'update_tournament',
        entity_type: 'tournament',
        entity_id: VALID_UUID,
        tournament_id: VALID_UUID,
        payload: {},
      },
    ] as any;
    const res = makeRes();
    await historyHandler(
      makeAuthedReq({
        method: 'GET',
        query: { id: VALID_UUID, entityType: 'match' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).logs).toHaveLength(1);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/dashboard
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/dashboard', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await dashboardHandler(
      makeAuthedReq({ method: 'POST', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on missing id', async () => {
    const res = makeRes();
    await dashboardHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET returns the dashboard payload with cache headers', async () => {
    // S5b-bis : tenant-gate ajoute, le handler verifie l'existence du tournoi
    // dans le tenant courant avant de deleguer au helper.
    store.tournaments = [
      { id: VALID_UUID, tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4' },
    ] as any;
    const res = makeRes();
    await dashboardHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toContain('max-age=30');
  });

  it('404 when fetch returns not ok', async () => {
    // tenant-gate : seed le tournoi pour passer le check
    store.tournaments = [
      { id: VALID_UUID, tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4' },
    ] as any;
    fetchDashboardData.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'Tournament not found',
    } as any);
    const res = makeRes();
    await dashboardHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});
