// tests/unit/adminMeTenantKind.test.ts
//
// /api/admin/me expose `active_tenant_kind` (organizer|developer) pour permettre
// au front d'adapter l'UI d'un compte développeur. On exerce le handler réel
// (withAuthRoute + supabase in-memory) en seedant staff / tenant_staff / tenants,
// et on vérifie que la nature du tenant actif résolu apparaît dans la réponse.
//
// Approche alignée sur apiAdminActiveTenant.test.ts : pas de mock de
// withAuthRoute ni de resolveActiveTenant/getTenantKind — on laisse la vraie
// résolution parcourir le store mocké (tenants.kind pilote le résultat).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import meHandler from '../../pages/api/admin/me';

const TENANT_DEV = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TENANT_ORG = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'owner@dev.io',
    role: 'owner',
    display_name: 'Owner',
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
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/api/admin/me — active_tenant_kind', () => {
  it('GET renvoie active_tenant_kind="developer" pour un tenant développeur', async () => {
    store.tenants = [
      { id: TENANT_DEV, slug: 'devco', name: 'DevCo', is_active: true, kind: 'developer' },
    ] as any;
    store.tenant_staff = [
      { tenant_id: TENANT_DEV, staff_id: 'staff-1', role: 'owner' },
    ] as any;

    const res = makeRes();
    await meHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('owner');
    expect(res.body.active_tenant_kind).toBe('developer');
  });

  it('GET renvoie active_tenant_kind="organizer" pour un tenant organisateur', async () => {
    store.tenants = [
      { id: TENANT_ORG, slug: 'orga', name: 'Orga', is_active: true, kind: 'organizer' },
    ] as any;
    store.tenant_staff = [
      { tenant_id: TENANT_ORG, staff_id: 'staff-1', role: 'owner' },
    ] as any;

    const res = makeRes();
    await meHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.active_tenant_kind).toBe('organizer');
  });

  it('401 sans auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    await meHandler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });
});
