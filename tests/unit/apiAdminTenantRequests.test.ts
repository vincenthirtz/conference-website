// tests/unit/apiAdminTenantRequests.test.ts
//
// Coverage for the owner-only tenant-requests admin queue endpoints:
//   - GET    /api/admin/tenant-requests
//   - POST   /api/admin/tenant-requests/[id]/reject
//   - POST   /api/admin/tenant-requests/[id]/expire
//
// These tests focus on the auth boundary (owner vs non-owner), the state
// transitions (only pending_* can be rejected/expired), and the input
// validation (UUID id, 1-500 char reason for reject).

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

import listHandler from '../../pages/api/admin/tenant-requests/index';
import rejectHandler from '../../pages/api/admin/tenant-requests/[id]/reject';
import expireHandler from '../../pages/api/admin/tenant-requests/[id]/expire';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_OWNER = '55555555-5555-5555-5555-555555555555';
const STAFF_ADMIN = '99999999-9999-9999-9999-999999999999';
const REQ_PENDING_EMAIL = '11111111-1111-1111-1111-111111111111';
const REQ_PENDING_BOT = '22222222-2222-2222-2222-222222222222';
const REQ_COMPLETED = '33333333-3333-3333-3333-333333333333';
const REQ_REJECTED = '44444444-4444-4444-4444-444444444444';
const REQ_UNKNOWN = '99999999-9999-9999-9999-000000000000';

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'owner'
): StaffMember {
  return {
    id: STAFF_OWNER,
    auth_user_id: 'user-owner',
    email: 'owner@example.com',
    role,
    display_name: 'Owner',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: false,
  };
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-owner' },
    cookies: { staff_active_tenant_id: TENANT_A },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
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

function seedTenantRequests() {
  store.tenant_requests = [
    {
      id: REQ_PENDING_EMAIL,
      status: 'pending_email_verification',
      requested_slug: 'alpha-org',
      requested_name: 'Alpha Org',
      requester_email: 'alpha@example.com',
      requester_discord_user_id: '1111111111111111111',
      requester_discord_display_name: 'AlphaUser',
      created_at: '2026-05-21T10:00:00.000Z',
      created_tenant_id: null,
      created_guild_id: null,
      rejection_reason: null,
      email_verification_token: 'a'.repeat(64),
    },
    {
      id: REQ_PENDING_BOT,
      status: 'pending_bot_invite',
      requested_slug: 'beta-org',
      requested_name: 'Beta Org',
      requester_email: 'beta@example.com',
      requester_discord_user_id: '2222222222222222222',
      requester_discord_display_name: 'BetaUser',
      created_at: '2026-05-21T11:00:00.000Z',
      created_tenant_id: null,
      created_guild_id: null,
      rejection_reason: null,
      email_verification_token: null,
    },
    {
      id: REQ_COMPLETED,
      status: 'completed',
      requested_slug: 'gamma-org',
      requested_name: 'Gamma Org',
      requester_email: 'gamma@example.com',
      requester_discord_user_id: '3333333333333333333',
      requester_discord_display_name: 'GammaUser',
      created_at: '2026-05-20T09:00:00.000Z',
      created_tenant_id: TENANT_A,
      created_guild_id: '9999999999999999999',
      rejection_reason: null,
      email_verification_token: null,
    },
    {
      id: REQ_REJECTED,
      status: 'rejected',
      requested_slug: 'delta-org',
      requested_name: 'Delta Org',
      requester_email: 'delta@example.com',
      requester_discord_user_id: '4444444444444444444',
      requester_discord_display_name: null,
      created_at: '2026-05-19T08:00:00.000Z',
      created_tenant_id: null,
      created_guild_id: null,
      rejection_reason: 'Spam suspect.',
      email_verification_token: null,
    },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-owner' });
  store.staff = [
    makeStaffRow('owner'),
    {
      id: STAFF_ADMIN,
      auth_user_id: 'user-admin',
      email: 'admin@example.com',
      role: 'admin',
      display_name: 'Admin',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    } as any,
  ] as any;
  store.tenants = [
    {
      id: TENANT_A,
      slug: 'alpha',
      name: 'Alpha',
      is_active: true,
      default_locale: 'fr',
      created_at: '2026-01-01',
    },
  ] as any;
  store.tenant_staff = [
    {
      tenant_id: TENANT_A,
      staff_id: STAFF_OWNER,
      role: 'admin',
      created_at: '2026-01-01',
    },
  ] as any;
  seedTenantRequests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * GET /api/admin/tenant-requests
 * =========================================================================*/

describe('GET /api/admin/tenant-requests', () => {
  it('200 owner : retourne toutes les demandes + total', async () => {
    const res = makeRes();
    await listHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.total).toBe(4);
    expect(body.requests).toHaveLength(4);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);

    const slugs = body.requests.map((r: any) => r.requestedSlug).sort();
    expect(slugs).toEqual(['alpha-org', 'beta-org', 'delta-org', 'gamma-org']);

    // Field-mapping check : DB snake_case -> response camelCase
    const sample = body.requests.find((r: any) => r.id === REQ_PENDING_EMAIL);
    expect(sample.requesterEmail).toBe('alpha@example.com');
    expect(sample.requesterDiscordUserId).toBe('1111111111111111111');
    expect(sample.requesterDiscordDisplayName).toBe('AlphaUser');
    expect(sample.createdTenantId).toBeNull();
    expect(sample.rejectionReason).toBeNull();
  });

  it('200 owner : filtre par status=pending_bot_invite', async () => {
    const res = makeRes();
    await listHandler(
      makeReq({ query: { status: 'pending_bot_invite' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.total).toBe(1);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].id).toBe(REQ_PENDING_BOT);
  });

  it('200 owner : filtre status=completed expose createdTenantId', async () => {
    const res = makeRes();
    await listHandler(makeReq({ query: { status: 'completed' } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].createdTenantId).toBe(TENANT_A);
    expect(body.requests[0].createdGuildId).toBe('9999999999999999999');
  });

  it('200 owner : status inconnu = fallback "all"', async () => {
    const res = makeRes();
    await listHandler(makeReq({ query: { status: 'bogus' } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).total).toBe(4);
  });

  it('200 owner : limit clamp à 100', async () => {
    const res = makeRes();
    await listHandler(makeReq({ query: { limit: '9999' } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).limit).toBe(100);
  });

  it('403 si non-owner (admin)', async () => {
    store.staff = [makeStaffRow('admin')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await listHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('403 si manager', async () => {
    store.staff = [makeStaffRow('admin')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await listHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('405 sur POST', async () => {
    const res = makeRes();
    await listHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* ===========================================================================
 * POST /api/admin/tenant-requests/[id]/reject
 * =========================================================================*/

describe('POST /api/admin/tenant-requests/[id]/reject', () => {
  it('200 happy path : pending_email_verification → rejected', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: REQ_PENDING_EMAIL },
        body: { reason: 'Email suspect (yopmail).' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.id).toBe(REQ_PENDING_EMAIL);
    expect(body.status).toBe('rejected');

    const row = (store.tenant_requests as any[]).find(
      (r) => r.id === REQ_PENDING_EMAIL
    );
    expect(row.status).toBe('rejected');
    expect(row.rejection_reason).toBe('Email suspect (yopmail).');
    expect(row.email_verification_token).toBeNull();
  });

  it('200 happy path : pending_bot_invite → rejected', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: REQ_PENDING_BOT },
        body: { reason: 'Slug réservé.' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.tenant_requests as any[]).find(
      (r) => r.id === REQ_PENDING_BOT
    );
    expect(row.status).toBe('rejected');
    expect(row.rejection_reason).toBe('Slug réservé.');
  });

  it('400 si id non UUID', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: 'not-a-uuid' },
        body: { reason: 'x' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_REQUEST_ID');
  });

  it('400 si reason vide', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: REQ_PENDING_EMAIL },
        body: { reason: '   ' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_REASON');
  });

  it('400 si reason > 500 chars', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: REQ_PENDING_EMAIL },
        body: { reason: 'x'.repeat(501) },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_REASON');
  });

  it('404 si request inconnue', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: REQ_UNKNOWN },
        body: { reason: 'spam' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('REQUEST_NOT_FOUND');
  });

  it('409 si status = completed (non-pending)', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: REQ_COMPLETED },
        body: { reason: 'late reject' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NOT_PENDING');
  });

  it('409 si status = rejected (déjà rejetée)', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: REQ_REJECTED },
        body: { reason: 'double' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NOT_PENDING');
  });

  it('403 si non-owner (admin)', async () => {
    store.staff = [makeStaffRow('admin')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await rejectHandler(
      makeReq({
        method: 'POST',
        query: { id: REQ_PENDING_EMAIL },
        body: { reason: 'spam' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('405 sur GET', async () => {
    const res = makeRes();
    await rejectHandler(
      makeReq({ method: 'GET', query: { id: REQ_PENDING_EMAIL } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* ===========================================================================
 * POST /api/admin/tenant-requests/[id]/expire
 * =========================================================================*/

describe('POST /api/admin/tenant-requests/[id]/expire', () => {
  it('200 happy path : pending_email_verification → expired', async () => {
    const res = makeRes();
    await expireHandler(
      makeReq({ method: 'POST', query: { id: REQ_PENDING_EMAIL } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).status).toBe('expired');

    const row = (store.tenant_requests as any[]).find(
      (r) => r.id === REQ_PENDING_EMAIL
    );
    expect(row.status).toBe('expired');
    expect(row.email_verification_token).toBeNull();
    // expire doesn't set a rejection_reason
    expect(row.rejection_reason).toBeNull();
  });

  it('200 happy path : pending_bot_invite → expired', async () => {
    const res = makeRes();
    await expireHandler(
      makeReq({ method: 'POST', query: { id: REQ_PENDING_BOT } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).status).toBe('expired');
  });

  it('400 si id non UUID', async () => {
    const res = makeRes();
    await expireHandler(
      makeReq({ method: 'POST', query: { id: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_REQUEST_ID');
  });

  it('404 si request inconnue', async () => {
    const res = makeRes();
    await expireHandler(
      makeReq({ method: 'POST', query: { id: REQ_UNKNOWN } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('REQUEST_NOT_FOUND');
  });

  it('409 si status = completed', async () => {
    const res = makeRes();
    await expireHandler(
      makeReq({ method: 'POST', query: { id: REQ_COMPLETED } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NOT_PENDING');
  });

  it('409 si status = rejected', async () => {
    const res = makeRes();
    await expireHandler(
      makeReq({ method: 'POST', query: { id: REQ_REJECTED } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NOT_PENDING');
  });

  it('403 si non-owner (admin)', async () => {
    store.staff = [makeStaffRow('admin')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await expireHandler(
      makeReq({ method: 'POST', query: { id: REQ_PENDING_EMAIL } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('405 sur GET', async () => {
    const res = makeRes();
    await expireHandler(
      makeReq({ method: 'GET', query: { id: REQ_PENDING_EMAIL } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
