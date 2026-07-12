// tests/unit/apiAdminApiTokensExpiry.test.ts
//
// Token hardening on the admin API-tokens routes:
//  - POST records `created_by` (the acting staff) and computes `expires_at`
//    from `expires_in_days` (server-side; no client-supplied timestamp).
//  - Omitting the TTL leaves `expires_at` null (no expiry — legacy behaviour).
//  - GET resolves the creator's display name into `created_by_name`.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import tokensIndexHandler from '../../pages/api/admin/api-tokens/index';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function seedStaff(displayName: string | null) {
  const staff: StaffMember = {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: displayName,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
  store.staff = [staff] as any;
  store.tenants = [
    { id: TENANT, slug: 'alpha', name: 'Alpha', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-1', role: 'admin' },
  ] as any;
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

describe('POST /api/admin/api-tokens — expiry + created_by', () => {
  it('records created_by and computes expires_at from expires_in_days', async () => {
    seedStaff('Alice');
    const before = Date.now();
    const res = makeRes();
    await tokensIndexHandler(
      makeReq({
        body: { name: 'CI key', scopes: ['matches:read'], expires_in_days: 30 },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const row = (store.tenant_api_tokens ?? [])[0] as any;
    expect(row.created_by).toBe('staff-1');
    expect(typeof row.expires_at).toBe('string');
    const expiresMs = new Date(row.expires_at).getTime();
    // ~30 days out (allow a generous window around the 30d target).
    expect(expiresMs).toBeGreaterThan(before + 29 * 86_400_000);
    expect(expiresMs).toBeLessThan(before + 31 * 86_400_000);
    expect((res.body as any).tokenMeta.expires_at).toBe(row.expires_at);
  });

  it('leaves expires_at null when no TTL is provided', async () => {
    seedStaff('Alice');
    const res = makeRes();
    await tokensIndexHandler(
      makeReq({ body: { name: 'Perpetual', scopes: ['matches:read'] } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const row = (store.tenant_api_tokens ?? [])[0] as any;
    expect(row.expires_at ?? null).toBeNull();
    expect(row.created_by).toBe('staff-1');
  });

  it('GET resolves created_by_name from the staff table', async () => {
    seedStaff('Alice');
    (store.tenant_api_tokens ||= []).push({
      id: 'tok-1',
      tenant_id: TENANT,
      token_hash: 'h',
      token_prefix: 'pk_live_abc123',
      name: 'Existing',
      scopes: ['matches:read'],
      created_at: '2026-06-01T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
      expires_at: null,
      created_by: 'staff-1',
      comp: false,
      comp_note: null,
    } as any);

    const res = makeRes();
    await tokensIndexHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const tokens = (res.body as any).tokens;
    expect(tokens).toHaveLength(1);
    expect(tokens[0].created_by_name).toBe('Alice');
  });
});
