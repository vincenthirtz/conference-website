// tests/unit/apiAdminActiveTenant.test.ts
//
// Tests pour /api/admin/active-tenant :
//  - GET 401 sans auth
//  - GET 200 retourne tenant + source
//  - POST 400 si tenant_id manquant / malforme
//  - POST 403 si tenant inaccessible
//  - POST 200 set cookie + retourne tenant

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import activeTenantHandler from '../../pages/api/admin/active-tenant';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.tenants = [
    {
      id: TENANT_A,
      slug: 'alpha',
      name: 'Alpha',
      is_active: true,
      default_locale: 'fr',
    },
    {
      id: TENANT_B,
      slug: 'beta',
      name: 'Beta',
      is_active: true,
      default_locale: 'fr',
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/api/admin/active-tenant', () => {
  it('401 sans auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    await activeTenantHandler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET retourne le tenant actif + source fallback_first', async () => {
    const res = makeRes();
    await activeTenantHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.tenant.id).toBe(TENANT_A);
    expect(body.source).toBe('fallback_first');
  });

  it('GET avec cookie present → source cookie', async () => {
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
      { tenant_id: TENANT_B, staff_id: 'staff-1', role: 'admin' },
    ] as any;
    const res = makeRes();
    await activeTenantHandler(
      makeReq({ method: 'GET', cookies: { staff_active_tenant_id: TENANT_B } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.tenant.id).toBe(TENANT_B);
    expect(body.source).toBe('cookie');
  });

  it('POST 400 si tenant_id absent', async () => {
    const res = makeRes();
    await activeTenantHandler(makeReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TENANT_ID');
  });

  it('POST 400 si tenant_id malforme', async () => {
    const res = makeRes();
    await activeTenantHandler(
      makeReq({ method: 'POST', body: { tenant_id: 'not-a-uuid' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 403 si tenant non accessible', async () => {
    const res = makeRes();
    await activeTenantHandler(
      makeReq({ method: 'POST', body: { tenant_id: TENANT_B } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('NO_ACCESS_TO_TENANT');
  });

  it('POST 200 set cookie + retourne tenant', async () => {
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
      { tenant_id: TENANT_B, staff_id: 'staff-1', role: 'admin' },
    ] as any;
    const res = makeRes();
    await activeTenantHandler(
      makeReq({ method: 'POST', body: { tenant_id: TENANT_B } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tenant.id).toBe(TENANT_B);
    expect(String(res.headers['Set-Cookie'])).toContain(
      `staff_active_tenant_id=${TENANT_B}`
    );
    expect(String(res.headers['Set-Cookie'])).toContain('HttpOnly');
    expect(String(res.headers['Set-Cookie'])).toContain('SameSite=Lax');
  });

  it('405 sur method autre', async () => {
    const res = makeRes();
    await activeTenantHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });
});
