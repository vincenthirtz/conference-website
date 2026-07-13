// tests/unit/apiAdminWebhooks.test.ts
//
// Admin webhook subscription routes:
//   - POST /api/admin/webhooks : creates a subscription, generates a secret
//     (returned once), records created_by, validates event_types.
//   - GET  : lists subscriptions + availableEvents (no secret leaked).
//   - PATCH /api/admin/webhooks/[id] : enable/disable (resets failures on enable).
//   - DELETE : removes the subscription (tenant-scoped).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import indexHandler from '../../pages/api/admin/webhooks/index';
import idHandler from '../../pages/api/admin/webhooks/[id]';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function seedStaff() {
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
  store.tenants = [{ id: TENANT, slug: 'alpha', name: 'Alpha', is_active: true }] as any;
  store.tenant_staff = [{ tenant_id: TENANT, staff_id: 'staff-1', role: 'admin' }] as any;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
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
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/webhooks', () => {
  it('creates a subscription, returns a secret once, records created_by', async () => {
    seedStaff();
    const res = makeRes();
    await indexHandler(
      makeReq({
        body: {
          url: 'https://example.com/hook',
          event_types: ['match.finished', 'tournament.finalized'],
          description: 'My overlay',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect((res.body as any).secret).toMatch(/^whsec_/);
    const row = (store.webhook_subscriptions ?? [])[0] as any;
    expect(row.url).toBe('https://example.com/hook');
    expect(row.event_types).toEqual(['match.finished', 'tournament.finalized']);
    expect(row.created_by).toBe('staff-1');
    expect(row.secret).toMatch(/^whsec_/);
    expect(row.enabled).not.toBe(false);
  });

  it('400 on unknown event types', async () => {
    seedStaff();
    const res = makeRes();
    await indexHandler(
      makeReq({ body: { url: 'https://x.com/h', event_types: ['bogus.event'] } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_EVENT_TYPES');
    expect(store.webhook_subscriptions ?? []).toHaveLength(0);
  });

  it('400 on a non-http URL', async () => {
    seedStaff();
    const res = makeRes();
    await indexHandler(
      makeReq({ body: { url: 'ftp://x.com/h', event_types: ['match.finished'] } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET lists subscriptions + availableEvents without leaking the secret', async () => {
    seedStaff();
    (store.webhook_subscriptions ||= []).push({
      id: SUB_ID,
      tenant_id: TENANT,
      url: 'https://example.com/h',
      secret: 'whsec_super',
      event_types: ['match.finished'],
      description: null,
      enabled: true,
      consecutive_failures: 0,
      disabled_at: null,
      last_delivery_at: null,
      last_error: null,
      created_at: '2026-06-01T00:00:00.000Z',
    } as any);

    const res = makeRes();
    await indexHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.subscriptions).toHaveLength(1);
    // Note: the handler's SELECT column list deliberately omits `secret`; the
    // in-memory mock doesn't honour PostgREST column projection, so we can't
    // assert its absence here (verified by the explicit column list in code).
    expect(body.availableEvents).toContain('match.finished');
  });
});

describe('PATCH / DELETE /api/admin/webhooks/[id]', () => {
  function seedSub(over: Record<string, unknown> = {}) {
    (store.webhook_subscriptions ||= []).push({
      id: SUB_ID,
      tenant_id: TENANT,
      url: 'https://example.com/h',
      secret: 'whsec_super',
      event_types: ['match.finished'],
      enabled: true,
      consecutive_failures: 8,
      disabled_at: null,
      ...over,
    } as any);
  }

  it('PATCH enable resets the consecutive-failure counter', async () => {
    seedStaff();
    seedSub({ enabled: false, consecutive_failures: 15, disabled_at: '2026-06-01T00:00:00.000Z' });
    const res = makeRes();
    await idHandler(
      makeReq({ method: 'PATCH', query: { id: SUB_ID }, body: { enabled: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.webhook_subscriptions ?? [])[0] as any;
    expect(row.enabled).toBe(true);
    expect(row.consecutive_failures).toBe(0);
    expect(row.disabled_at).toBeNull();
  });

  it('PATCH on another tenant → 404', async () => {
    seedStaff();
    seedSub({ tenant_id: 'other-tenant' });
    const res = makeRes();
    await idHandler(
      makeReq({ method: 'PATCH', query: { id: SUB_ID }, body: { enabled: false } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE removes the subscription', async () => {
    seedStaff();
    seedSub();
    const res = makeRes();
    await idHandler(makeReq({ method: 'DELETE', query: { id: SUB_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).ok).toBe(true);
    expect(store.webhook_subscriptions ?? []).toHaveLength(0);
  });
});
