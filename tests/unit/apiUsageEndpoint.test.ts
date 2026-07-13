// tests/unit/apiUsageEndpoint.test.ts
//
// Developer-portal backend (axis 03):
//   - GET /api/admin/api-usage  : read-only plan + quota/usage panel. Reads (never
//     consumes) `api_usage_counters` for the current minute + month windows.
//     Asserts used/limit mapping incl. Infinity→null, the discovery locked-state,
//     401 without staff auth, and 405 on POST.
//   - GET /api/public/webhook-events : anonymous catalog of PUBLIC webhook event
//     types. Asserts it lists the public events and omits internal Discord ones.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { minuteKey, monthKey } from '../../utils/billing/apiQuota';

import usageHandler from '../../pages/api/admin/api-usage';
import webhookEventsHandler from '../../pages/api/public/webhook-events';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function seedStaff(tenantOver: Record<string, unknown> = {}) {
  const staff: StaffMember = {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: 'Alice',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
  store.staff = [staff] as any;
  store.tenants = [
    {
      id: TENANT,
      slug: 'alpha',
      name: 'Alpha',
      is_active: true,
      plan: 'circuit',
      plan_status: 'active',
      plan_expires_at: null,
      ...tenantOver,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-1', role: 'admin' },
  ] as any;
}

function seedCounter(kind: 'minute' | 'month', key: string, count: number) {
  (store.api_usage_counters ||= []).push({
    tenant_id: TENANT,
    window_kind: kind,
    window_key: key,
    count,
  } as any);
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-1' },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end() {
      return this;
    },
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/admin/api-usage', () => {
  it('maps used + finite limits for a paid plan (circuit)', async () => {
    seedStaff({ plan: 'circuit' });
    const now = new Date();
    seedCounter('minute', minuteKey(now), 5);
    seedCounter('month', monthKey(now), 1234);

    const res = makeRes();
    await usageHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    const body = res.body as any;
    expect(body.plan).toBe('circuit');
    expect(body.effectivePlan).toBe('circuit');
    expect(body.apiRead).toBe(true);
    expect(body.apiWrite).toBe(true);
    expect(body.minute).toEqual({ used: 5, limit: 120 });
    expect(body.month).toEqual({
      used: 1234,
      limit: 500_000,
      key: monthKey(now),
    });
    expect(typeof body.tokensHint).toBe('string');
  });

  it('represents Infinity limits as null (foundation) while still reading usage', async () => {
    seedStaff({ plan: 'foundation' });
    const now = new Date();
    seedCounter('month', monthKey(now), 42);

    const res = makeRes();
    await usageHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.effectivePlan).toBe('foundation');
    expect(body.apiRead).toBe(true);
    expect(body.minute.limit).toBeNull();
    expect(body.month.limit).toBeNull();
    expect(body.month.used).toBe(42);
    // No minute counter seeded → 0.
    expect(body.minute.used).toBe(0);
  });

  it('returns 0/0 used=0 limit=0 for a plan without API entitlement (discovery locked state)', async () => {
    seedStaff({ plan: 'discovery' });
    const now = new Date();
    // Even if a counter row exists, a plan without apiRead must not read it.
    seedCounter('minute', minuteKey(now), 99);
    seedCounter('month', monthKey(now), 99);

    const res = makeRes();
    await usageHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.effectivePlan).toBe('discovery');
    expect(body.apiRead).toBe(false);
    expect(body.apiWrite).toBe(false);
    expect(body.minute).toEqual({ used: 0, limit: 0 });
    expect(body.month.used).toBe(0);
    expect(body.month.limit).toBe(0);
    expect(body.month.key).toBe(monthKey(now));
  });

  it('downgrades an expired paid plan to discovery (locked state)', async () => {
    seedStaff({
      plan: 'circuit',
      plan_status: 'active',
      plan_expires_at: '2020-01-01T00:00:00.000Z',
    });

    const res = makeRes();
    await usageHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    // The billed plan is still surfaced, but entitlement resolves to discovery.
    expect(body.plan).toBe('circuit');
    expect(body.effectivePlan).toBe('discovery');
    expect(body.apiRead).toBe(false);
    expect(body.minute.limit).toBe(0);
  });

  it('returns 401 without staff auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    // No Authorization header + no auth cookie → unauthenticated (401), as
    // opposed to authenticated-but-not-staff (403).
    await usageHandler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 405 + Allow: GET on POST', async () => {
    seedStaff();
    const res = makeRes();
    await usageHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });
});

describe('GET /api/public/webhook-events', () => {
  it('lists the PUBLIC event catalog + signature metadata', async () => {
    const res = makeRes();
    await webhookEventsHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = res.body as any;
    const types = body.data.events.map((e: any) => e.type);

    expect(types).toContain('match.scheduled');
    expect(types).toContain('match.finished');
    expect(types).toContain('tournament.finalized');
    expect(types).toContain('registration.new');
    expect(types).toContain('news.published');
    expect(types).toContain('checkin.opened');

    // Every event carries a non-empty description.
    for (const ev of body.data.events) {
      expect(typeof ev.description).toBe('string');
      expect(ev.description.length).toBeGreaterThan(0);
    }

    expect(body.data.signature).toEqual({
      header: 'X-Webhook-Signature',
      algo: 'HMAC-SHA256',
      format: 'sha256=<hex>',
    });
  });

  it('omits internal Discord-only events', async () => {
    const res = makeRes();
    await webhookEventsHandler(makeReq(), res);

    const types = (res.body as any).data.events.map((e: any) => e.type);
    for (const internal of [
      'team.member.joined',
      'team.member.left',
      'cast.assigned',
      'staff.role.changed',
      'scrim.planning.opened',
      'checkin.nudge',
      'broadcast.state_changed',
    ]) {
      expect(types).not.toContain(internal);
    }
  });

  it('returns 405 on POST', async () => {
    const res = makeRes();
    await webhookEventsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET, OPTIONS');
  });
});
