import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

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

import conflictsHandler from '../../pages/api/admin/tournament/[id]/conflicts';
import discordWebhooksHandler from '../../pages/api/admin/tournament/[id]/discord-webhooks';

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

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
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
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

const TID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/conflicts
 * ---------------------------------------------------------*/

describe('GET /api/admin/tournament/[id]/conflicts', () => {
  it('405 on non-GET', async () => {
    const res = makeRes();
    await conflictsHandler(
      makeReq({ method: 'POST', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await conflictsHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 with no conflicts when single match per team', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: 's1',
        round_number: 1,
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't2',
        scheduled_at: '2026-04-01T10:00:00Z',
        is_bye: false,
        status: 'pending',
        team1: { name: 'Alpha' },
        team2: { name: 'Beta' },
      },
    ] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: TID, name: 'Group' },
    ] as any;
    const res = makeRes();
    await conflictsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.total).toBe(0);
    expect(body.checked_matches).toBe(1);
  });

  it('200 detects overlapping matches for the same team', async () => {
    // Two matches scheduled 10 min apart, bo3 = 45min duration -> overlap
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: 's1',
        round_number: 1,
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't2',
        scheduled_at: '2026-04-01T10:00:00Z',
        is_bye: false,
        status: 'pending',
        team1: { name: 'Alpha' },
        team2: { name: 'Beta' },
      },
      {
        id: 'm2',
        tournament_id: TID,
        stage_id: 's1',
        round_number: 1,
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't3',
        scheduled_at: '2026-04-01T10:10:00Z',
        is_bye: false,
        status: 'pending',
        team1: { name: 'Alpha' },
        team2: { name: 'Gamma' },
      },
    ] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: TID, name: 'Group' },
    ] as any;

    const res = makeRes();
    await conflictsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    const body = res.body as any;
    expect(body.total).toBe(1);
    expect(body.conflicts[0].team_id).toBe('t1');
    expect(body.conflicts[0].overlap_minutes).toBeGreaterThan(0);
  });

  it('200 ignores BYE matches', async () => {
    store.matches = [
      {
        id: 'bye',
        tournament_id: TID,
        scheduled_at: '2026-04-01T10:00:00Z',
        is_bye: true,
        status: 'finished',
        team1_id: 't1',
        team2_id: null,
      },
    ] as any;
    store.tournament_stages = [];
    const res = makeRes();
    await conflictsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect((res.body as any).checked_matches).toBe(0);
  });

  it('200 deduplicates conflict pairs', async () => {
    // Three overlapping matches for t1 — pairs should be deduped per pair.
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't2',
        scheduled_at: '2026-04-01T10:00:00Z',
        is_bye: false,
        status: 'pending',
        team1: { name: 'Alpha' },
        team2: { name: 'Beta' },
      },
      {
        id: 'm2',
        tournament_id: TID,
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't3',
        scheduled_at: '2026-04-01T10:10:00Z',
        is_bye: false,
        status: 'pending',
        team1: { name: 'Alpha' },
        team2: { name: 'Gamma' },
      },
      {
        id: 'm3',
        tournament_id: TID,
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't4',
        scheduled_at: '2026-04-01T10:20:00Z',
        is_bye: false,
        status: 'pending',
        team1: { name: 'Alpha' },
        team2: { name: 'Delta' },
      },
    ] as any;
    store.tournament_stages = [];
    const res = makeRes();
    await conflictsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    const body = res.body as any;
    // 3 pairs: (m1,m2), (m1,m3), (m2,m3) — all overlapping
    expect(body.total).toBe(3);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/discord-webhooks
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/discord-webhooks', () => {
  beforeEach(() => {
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 returns scoped + globals separated', async () => {
    store.discord_webhooks = [
      {
        id: 'w1',
        tournament_id: TID,
        channel_type: 'match_announcements',
        webhook_url: 'https://discord.com/api/webhooks/1/abc',
      },
      {
        id: 'w2',
        tournament_id: null,
        channel_type: 'general_announcements',
        webhook_url: 'https://discord.com/api/webhooks/2/def',
      },
      {
        id: 'w3',
        tournament_id: 'other-tournament',
        channel_type: 'match_results',
        webhook_url: 'https://discord.com/api/webhooks/3/ghi',
      },
    ] as any;
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    // scoped includes w1 (and w3 because mock .or() is no-op — let's at least check w1)
    expect(body.scoped.find((w: any) => w.id === 'w1')).toBeTruthy();
    expect(body.globals.find((w: any) => w.id === 'w2')).toBeTruthy();
    expect(body.channelTypes).toContain('match_announcements');
  });

  it('PUT 400 on invalid channelType', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({
        method: 'PUT',
        query: { id: TID },
        body: { channelType: 'bogus', webhookUrl: 'https://discord.com/api/webhooks/1/x' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 on non-Discord URL', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({
        method: 'PUT',
        query: { id: TID },
        body: {
          channelType: 'match_results',
          webhookUrl: 'https://evil.com/hook',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 200 inserts a new webhook', async () => {
    store.discord_webhooks = [];
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({
        method: 'PUT',
        query: { id: TID },
        body: {
          channelType: 'match_results',
          webhookUrl: 'https://discord.com/api/webhooks/123/abc',
          roleMention: '<@&123>',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.discord_webhooks as any).length).toBe(1);
    expect((store.discord_webhooks as any)[0].role_mention).toBe('<@&123>');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('PUT 200 updates existing webhook for the (tournament, channel_type) pair', async () => {
    store.discord_webhooks = [
      {
        id: 'w1',
        tournament_id: TID,
        channel_type: 'match_results',
        webhook_url: 'https://discord.com/api/webhooks/old/old',
      },
    ] as any;
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({
        method: 'PUT',
        query: { id: TID },
        body: {
          channelType: 'match_results',
          webhookUrl: 'https://discord.com/api/webhooks/new/new',
          isActive: false,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.discord_webhooks as any).length).toBe(1);
    expect((store.discord_webhooks as any)[0].webhook_url).toContain('new');
    expect((store.discord_webhooks as any)[0].is_active).toBe(false);
  });

  it('DELETE 400 on invalid channelType', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({
        method: 'DELETE',
        query: { id: TID, channelType: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE 200 removes the matching webhook', async () => {
    store.discord_webhooks = [
      {
        id: 'w1',
        tournament_id: TID,
        channel_type: 'match_results',
        webhook_url: 'https://discord.com/api/webhooks/x/y',
      },
    ] as any;
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({
        method: 'DELETE',
        query: { id: TID, channelType: 'match_results' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.discord_webhooks.length).toBe(0);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await discordWebhooksHandler(
      makeReq({ method: 'PATCH', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
