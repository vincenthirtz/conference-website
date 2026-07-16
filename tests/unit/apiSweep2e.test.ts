// Sweep 2e: small public/admin handlers still at 0% coverage.
//
// Targets:
//  - pages/api/admin/logout.ts
//  - pages/api/admin/test-email.ts
//  - pages/api/admin/alerts-summary.ts
//  - pages/api/admin/email-logs.ts
//  - pages/api/admin/helloasso/memberships.ts
//  - pages/api/admin/matches/[matchId]/history.ts
//  - pages/api/twitch-channels.ts (public)
//  - pages/api/contact.ts (public)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const {
  sendTestEmail,
  sendContactStaffEmail,
  fetchAlertsSignals,
  summarizeAlerts,
  resolveCurrentTournamentId,
  fetchMemberships,
  fetchForms,
} = vi.hoisted(() => ({
  sendTestEmail: vi.fn(async () => ({ success: true as const })),
  sendContactStaffEmail: vi.fn(async () => ({ success: true as const })),
  fetchAlertsSignals: vi.fn(async () => ({
    ok: true as const,
    summary: { total: 0 } as any,
  })),
  summarizeAlerts: vi.fn(() => ({ total: 0 })),
  resolveCurrentTournamentId: vi.fn(async () => null as string | null),
  fetchMemberships: vi.fn(async () => ({
    data: [],
    pagination: { pageIndex: 1, pageSize: 100, totalCount: 0, totalPages: 0 },
  })),
  fetchForms: vi.fn(
    async () =>
      [] as Array<{
        formSlug: string;
        formType: string;
        title: string;
        state: string;
      }>
  ),
}));

vi.mock('@/utils/email', () => ({ sendTestEmail, sendContactStaffEmail }));
vi.mock('@/utils/dashboard/buildTournamentDashboard', () => ({
  summarizeAlerts,
}));
vi.mock('@/utils/dashboard/alertsSignals', () => ({ fetchAlertsSignals }));
vi.mock('@/utils/currentTournament', () => ({ resolveCurrentTournamentId }));
vi.mock('@/utils/helloasso', () => ({ fetchMemberships, fetchForms }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setCookieUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import logoutHandler from '../../pages/api/admin/logout';
import testEmailHandler from '../../pages/api/admin/test-email';
import alertsSummaryHandler from '../../pages/api/admin/alerts-summary';
import emailLogsHandler from '../../pages/api/admin/email-logs';
import membershipsHandler from '../../pages/api/admin/helloasso/memberships';
import matchHistoryHandler from '../../pages/api/admin/matches/[matchId]/history';
import twitchChannelsPublicHandler from '../../pages/api/twitch-channels';
import contactHandler from '../../pages/api/contact';

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

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: {},
    body: {},
    ...over,
  };
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
  sendTestEmail.mockClear();
  sendContactStaffEmail.mockClear();
  fetchAlertsSignals.mockClear();
  summarizeAlerts.mockClear();
  resolveCurrentTournamentId.mockClear();
  fetchMemberships.mockClear();
  fetchForms.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * /api/admin/logout
 * ---------------------------------------------------------*/

describe('/api/admin/logout', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await logoutHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('403 on POST without Origin/Referer (CSRF check)', async () => {
    // csrfCheck (utils/staff.ts) rejette les POST navigateur sans Origin ni
    // Referer correspondant au host — la déconnexion forcée cross-site est
    // bloquée avant même d'atteindre supabase.auth.signOut.
    // Le chemin nominal (Origin qui matche → 200) est couvert par
    // tests/unit/apiAdminLogout.test.ts.
    setCookieUser({ id: 'user-cookie' });
    const res = makeRes();
    await logoutHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * /api/admin/test-email
 * ---------------------------------------------------------*/

describe('/api/admin/test-email', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await testEmailHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when "to" missing', async () => {
    const res = makeRes();
    await testEmailHandler(makeAuthedReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('200 when sendTestEmail succeeds', async () => {
    const res = makeRes();
    await testEmailHandler(
      makeAuthedReq({ method: 'POST', body: { to: 'x@y.com' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(sendTestEmail).toHaveBeenCalledWith('x@y.com');
  });

  it('502 when sendTestEmail fails', async () => {
    sendTestEmail.mockResolvedValueOnce({
      success: false,
      error: 'smtp down',
    } as any);
    const res = makeRes();
    await testEmailHandler(
      makeAuthedReq({ method: 'POST', body: { to: 'x@y.com' } }),
      res
    );
    expect(res.statusCode).toBe(502);
  });
});

/* -----------------------------------------------------------
 * /api/admin/alerts-summary
 * ---------------------------------------------------------*/

describe('/api/admin/alerts-summary', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await alertsSummaryHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid tournament_id', async () => {
    const res = makeRes();
    await alertsSummaryHandler(
      makeAuthedReq({
        method: 'GET',
        query: { tournament_id: 'not-uuid' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 with no current tournament returns empty summary', async () => {
    resolveCurrentTournamentId.mockResolvedValueOnce(null);
    const res = makeRes();
    await alertsSummaryHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(summarizeAlerts).toHaveBeenCalledWith(null);
  });

  it('200 with override id', async () => {
    fetchAlertsSignals.mockResolvedValueOnce({
      ok: true,
      summary: { total: 3 } as any,
    } as any);
    const res = makeRes();
    await alertsSummaryHandler(
      makeAuthedReq({
        method: 'GET',
        query: { tournament_id: VALID_UUID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).total).toBe(3);
  });

  it('error from fetchAlertsSignals propagates status', async () => {
    fetchAlertsSignals.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'no tournament',
    } as any);
    const res = makeRes();
    await alertsSummaryHandler(
      makeAuthedReq({
        method: 'GET',
        query: { tournament_id: VALID_UUID },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

/* -----------------------------------------------------------
 * /api/admin/email-logs
 * ---------------------------------------------------------*/

describe('/api/admin/email-logs', () => {
  const ORIG_KEY = process.env.BREVO_API_KEY;
  let fetchSpy: any;

  beforeEach(() => {
    process.env.BREVO_API_KEY = 'test-key';
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    process.env.BREVO_API_KEY = ORIG_KEY;
    fetchSpy?.mockRestore?.();
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await emailLogsHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('500 when BREVO_API_KEY is missing', async () => {
    delete process.env.BREVO_API_KEY;
    const res = makeRes();
    await emailLogsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(500);
  });

  it('200 returns Brevo events', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events: [{ event: 'delivered' }] }),
    } as any);
    const res = makeRes();
    await emailLogsHandler(
      makeAuthedReq({
        method: 'GET',
        query: {
          limit: '10',
          email: 'x@y.com',
          event: 'delivered',
          startDate: '2026-01-01',
          endDate: '2026-04-30',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
    expect(url).toContain('email=x%40y.com');
  });

  it('forwards Brevo error status', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    } as any);
    const res = makeRes();
    await emailLogsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('502 on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await emailLogsHandler(makeAuthedReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(502);
  });
});

/* -----------------------------------------------------------
 * /api/admin/helloasso/memberships
 * ---------------------------------------------------------*/

describe('/api/admin/helloasso/memberships', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await membershipsHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 with explicit formSlug', async () => {
    fetchMemberships.mockResolvedValueOnce({
      data: [{ id: 1 }],
      pagination: {
        pageIndex: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1,
      },
    } as any);
    const res = makeRes();
    await membershipsHandler(
      makeAuthedReq({
        method: 'GET',
        query: { formSlug: 'my-form', page: '1', pageSize: '50' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(fetchMemberships).toHaveBeenCalledWith('my-form', 1, 50);
  });

  it('404 when no Membership form found via auto-detect', async () => {
    fetchForms.mockResolvedValueOnce([
      { formSlug: 'don', formType: 'Donation', title: 'Don', state: 'Public' },
    ] as any);
    const res = makeRes();
    await membershipsHandler(makeAuthedReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(404);
  });

  it('200 auto-detects Membership form', async () => {
    fetchForms.mockResolvedValueOnce([
      { formSlug: 'don', formType: 'Donation', title: 'Don', state: 'Public' },
      {
        formSlug: 'adh',
        formType: 'Membership',
        title: 'Adh',
        state: 'Public',
      },
    ] as any);
    fetchMemberships.mockResolvedValueOnce({
      data: [],
      pagination: {
        pageIndex: 1,
        pageSize: 100,
        totalCount: 0,
        totalPages: 0,
      },
    } as any);
    const res = makeRes();
    await membershipsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(fetchMemberships).toHaveBeenCalledWith('adh', 1, 100);
  });

  it('502 on fetch error', async () => {
    fetchForms.mockRejectedValueOnce(new Error('boom'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await membershipsHandler(makeAuthedReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(502);
  });
});

/* -----------------------------------------------------------
 * /api/admin/matches/[matchId]/history
 * ---------------------------------------------------------*/

describe('/api/admin/matches/[matchId]/history', () => {
  it('400 on invalid matchId', async () => {
    const res = makeRes();
    await matchHistoryHandler(
      makeAuthedReq({ method: 'GET', query: { matchId: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await matchHistoryHandler(
      makeAuthedReq({ method: 'POST', query: { matchId: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('GET merges match + game logs sorted desc', async () => {
    store.staff_logs = [
      {
        id: 'l-match',
        created_at: '2026-04-01T00:00:00.000Z',
        staff_id: 's1',
        action: 'update_match',
        entity_type: 'match',
        entity_id: VALID_UUID,
        tournament_id: null,
        payload: {},
      },
      {
        id: 'l-game',
        created_at: '2026-04-02T00:00:00.000Z',
        staff_id: 's1',
        action: 'update_match',
        entity_type: 'game',
        entity_id: 'g1',
        tournament_id: null,
        payload: { match_id: VALID_UUID },
      },
      {
        id: 'l-other',
        created_at: '2026-04-03T00:00:00.000Z',
        staff_id: 's1',
        action: 'update_match',
        entity_type: 'game',
        entity_id: 'g-other',
        tournament_id: null,
        payload: { match_id: 'other-match' },
      },
    ] as any;
    const res = makeRes();
    await matchHistoryHandler(
      makeAuthedReq({ method: 'GET', query: { matchId: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.matchId).toBe(VALID_UUID);
    // Two logs match (one match log, one game log with payload.match_id == matchId)
    expect(body.logs.length).toBe(2);
    // Sorted descending by created_at
    expect(body.logs[0].id).toBe('l-game');
  });
});

/* -----------------------------------------------------------
 * /api/twitch-channels (public)
 * ---------------------------------------------------------*/

describe('/api/twitch-channels (public)', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await twitchChannelsPublicHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('GET returns active channels with cache header', async () => {
    store.twitch_channels = [
      {
        channel: 'streamer1',
        label: 'S1',
        badge: null,
        description: null,
        background_url: null,
        is_active: true,
        sort_order: 1,
      },
      {
        channel: 'inactive',
        label: 'X',
        is_active: false,
      },
    ] as any;
    const res = makeRes();
    await twitchChannelsPublicHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items.length).toBe(1);
    expect((res.body as any).items[0].channel).toBe('streamer1');
    expect(res.headers['Cache-Control']).toContain('s-maxage=300');
  });
});

/* -----------------------------------------------------------
 * /api/contact (public)
 * ---------------------------------------------------------*/

describe('/api/contact (public)', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await contactHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid body (short message)', async () => {
    const res = makeRes();
    await contactHandler(
      makeReq({
        method: 'POST',
        body: {
          name: 'Alice',
          email: 'a@b.com',
          subject: 'Hi',
          message: 'short',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 on valid body', async () => {
    const res = makeRes();
    await contactHandler(
      makeReq({
        method: 'POST',
        body: {
          name: 'Alice',
          email: 'a@b.com',
          subject: 'Hi there',
          message: 'This is a long enough message body.',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(sendContactStaffEmail).toHaveBeenCalled();
  });

  it('500 when email send fails', async () => {
    sendContactStaffEmail.mockResolvedValueOnce({
      success: false,
      error: 'down',
    } as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await contactHandler(
      makeReq({
        method: 'POST',
        body: {
          name: 'Alice',
          email: 'a@b.com',
          subject: 'Hi there',
          message: 'This is a long enough message.',
        },
      }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });
});
