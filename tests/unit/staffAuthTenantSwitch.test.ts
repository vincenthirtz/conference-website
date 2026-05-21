// tests/unit/staffAuthTenantSwitch.test.ts
//
// Tests pour le refactor S7 de `requireStaffRoleFromRequest` :
//  - cookie present + valide + accessible → tenantId = cookie, source 'cookie'
//  - cookie absent → fallback first (tri slug ASC), source 'fallback_first'
//  - cookie present mais tenant inaccessible → fallback first
//  - staff sans aucune entree tenant_staff → DEFAULT_TENANT_ID,
//    source 'fallback_default'
//  - cookie malforme → ignore (fallback first)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import {
  invalidateStaffCache,
  requireStaffRoleFromRequest,
} from '../../utils/staff';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TENANT_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DEFAULT_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function makeStaffRow(): StaffMember {
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

function makeReq(cookies: Record<string, string> = {}, token = 't-token'): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${token}` },
    cookies,
    query: {},
    body: {},
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
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
  store.staff = [makeStaffRow()] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('requireStaffRoleFromRequest tenant resolution', () => {
  it('cookie present + valide + accessible → source cookie', async () => {
    store.tenants = [
      { id: TENANT_A, slug: 'alpha' },
      { id: TENANT_B, slug: 'beta' },
    ] as any;
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
      { tenant_id: TENANT_B, staff_id: 'staff-1', role: 'admin' },
    ] as any;

    const ctx = await requireStaffRoleFromRequest(
      makeReq({ staff_active_tenant_id: TENANT_B }),
      makeRes(),
      'admin'
    );
    expect(ctx.tenantId).toBe(TENANT_B);
    expect(ctx.currentTenantSource).toBe('cookie');
  });

  it('cookie absent → fallback first (tri slug ASC)', async () => {
    store.tenants = [
      { id: TENANT_A, slug: 'zulu' },
      { id: TENANT_B, slug: 'alpha' },
      { id: TENANT_C, slug: 'mike' },
    ] as any;
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
      { tenant_id: TENANT_B, staff_id: 'staff-1', role: 'admin' },
      { tenant_id: TENANT_C, staff_id: 'staff-1', role: 'admin' },
    ] as any;

    const ctx = await requireStaffRoleFromRequest(
      makeReq({}),
      makeRes(),
      'admin'
    );
    // Note: jointure faite via embed dans le code ; on s'attend a "alpha"
    // car c'est le slug le plus petit.
    expect(ctx.tenantId).toBe(TENANT_B);
    expect(ctx.currentTenantSource).toBe('fallback_first');
  });

  it('cookie inaccessible → fallback first', async () => {
    store.tenants = [{ id: TENANT_A, slug: 'alpha' }] as any;
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
    ] as any;

    const ctx = await requireStaffRoleFromRequest(
      makeReq({ staff_active_tenant_id: TENANT_B }), // pas dans tenant_staff
      makeRes(),
      'admin'
    );
    expect(ctx.tenantId).toBe(TENANT_A);
    expect(ctx.currentTenantSource).toBe('fallback_first');
  });

  it('cookie malforme → fallback first', async () => {
    store.tenants = [{ id: TENANT_A, slug: 'alpha' }] as any;
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
    ] as any;

    const ctx = await requireStaffRoleFromRequest(
      makeReq({ staff_active_tenant_id: 'not-a-uuid' }),
      makeRes(),
      'admin'
    );
    expect(ctx.tenantId).toBe(TENANT_A);
    expect(ctx.currentTenantSource).toBe('fallback_first');
  });

  it('staff sans aucune entree tenant_staff → DEFAULT_TENANT_ID', async () => {
    store.tenants = [] as any;
    store.tenant_staff = [] as any;

    const ctx = await requireStaffRoleFromRequest(
      makeReq({}),
      makeRes(),
      'admin'
    );
    expect(ctx.tenantId).toBe(DEFAULT_TENANT_ID);
    expect(ctx.currentTenantSource).toBe('fallback_default');
  });
});
