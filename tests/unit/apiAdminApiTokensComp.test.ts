// tests/unit/apiAdminApiTokensComp.test.ts
//
// Tests the partner-exemption (`comp`) controls on the admin API-tokens routes:
//  - POST /api/admin/api-tokens : `comp = true` requires the `owner` role
//    (a plain admin gets 403 FORBIDDEN_COMP). `comp = false` (default) is fine
//    for admins and persists comp=false.
//  - PATCH /api/admin/api-tokens/[id] : activating `comp` requires owner too;
//    deactivating is allowed for admins.
//
// Rationale: `comp` grants FREE API access (bypasses the plan gate), so it must
// not be a self-service admin action.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import tokensIndexHandler from '../../pages/api/admin/api-tokens/index';
import tokenIdHandler from '../../pages/api/admin/api-tokens/[id]';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TOKEN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeStaffRow(role: StaffMember['role']): StaffMember {
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

function seedStaff(role: StaffMember['role']) {
  store.staff = [makeStaffRow(role)] as any;
  store.tenants = [
    { id: TENANT, slug: 'alpha', name: 'Alpha', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-1', role },
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

describe('POST /api/admin/api-tokens — comp owner gate', () => {
  it('admin creating comp=true → 403 FORBIDDEN_COMP', async () => {
    seedStaff('admin');
    const res = makeRes();
    await tokensIndexHandler(
      makeReq({
        body: { name: 'Partner', scopes: ['matches:read'], comp: true },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('FORBIDDEN_COMP');
    // No token row persisted.
    expect(store.tenant_api_tokens ?? []).toHaveLength(0);
  });

  it('owner creating comp=true → 201, row persisted with comp=true', async () => {
    seedStaff('owner');
    const res = makeRes();
    await tokensIndexHandler(
      makeReq({
        body: {
          name: 'Partner',
          scopes: ['matches:read'],
          comp: true,
          comp_note: 'Sponsor overlay',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).token).toMatch(/^pk_live_/);
    expect((res.body as any).tokenMeta.comp).toBe(true);
    const row = (store.tenant_api_tokens ?? [])[0];
    expect(row.comp).toBe(true);
    expect(row.comp_note).toBe('Sponsor overlay');
  });

  it('admin creating without comp → 201, comp=false persisted', async () => {
    seedStaff('admin');
    const res = makeRes();
    await tokensIndexHandler(
      makeReq({ body: { name: 'Normal', scopes: ['matches:read'] } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const row = (store.tenant_api_tokens ?? [])[0];
    expect(row.comp).toBe(false);
    expect(row.comp_note).toBeNull();
  });
});

describe('PATCH /api/admin/api-tokens/[id] — comp owner gate', () => {
  function seedTokenRow(comp = false) {
    (store.tenant_api_tokens ||= []).push({
      id: TOKEN_ID,
      tenant_id: TENANT,
      token_hash: 'h',
      token_prefix: 'pk_live_aaa',
      name: 'Key',
      scopes: ['matches:read'],
      revoked_at: null,
      comp,
      comp_note: comp ? 'note' : null,
    });
  }

  it('admin activating comp=true → 403 FORBIDDEN_COMP', async () => {
    seedStaff('admin');
    seedTokenRow(false);
    const res = makeRes();
    await tokenIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TOKEN_ID },
        body: { comp: true },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('FORBIDDEN_COMP');
    expect((store.tenant_api_tokens[0] as any).comp).toBe(false);
  });

  it('owner activating comp=true → 200, row updated', async () => {
    seedStaff('owner');
    seedTokenRow(false);
    const res = makeRes();
    await tokenIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TOKEN_ID },
        body: { comp: true, comp_note: 'Partner X' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).token.comp).toBe(true);
    expect((store.tenant_api_tokens[0] as any).comp).toBe(true);
    expect((store.tenant_api_tokens[0] as any).comp_note).toBe('Partner X');
  });

  it('admin deactivating comp=false → 200, comp cleared', async () => {
    seedStaff('admin');
    seedTokenRow(true);
    const res = makeRes();
    await tokenIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TOKEN_ID },
        body: { comp: false },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tenant_api_tokens[0] as any).comp).toBe(false);
    expect((store.tenant_api_tokens[0] as any).comp_note).toBeNull();
  });
});
