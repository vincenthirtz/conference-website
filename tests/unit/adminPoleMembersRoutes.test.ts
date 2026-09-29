// tests/unit/adminPoleMembersRoutes.test.ts
//
// Membres des pôles de l'association, routes migrées sur `defineAdminRoute`
// (features/admin/pole-members) : succès, erreurs historiques, journal et
// régénération de /association.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import poleMembersHandler from '../../pages/api/admin/pole-members/index';
import poleMemberByIdHandler from '../../pages/api/admin/pole-members/[id]';

const MEMBER_ID = 'a1b2c3d4-0000-4000-8000-0000000000aa';

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-poles-${n}` },
    query: {},
    cookies: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    ended: false,
    revalidated: [] as string[],
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => ((res.ended = true), res);
  res.revalidate = async (path: string) => {
    res.revalidated.push(path);
  };
  return res;
}

function staffRow(role: StaffMember['role'] = 'admin'): StaffMember {
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

function member(over: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    pole_key: 'direction',
    name: 'Alice',
    title: null,
    description: null,
    image_url: null,
    link_url: null,
    is_active: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow()] as any;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/api/admin/pole-members', () => {
  it('GET lists active members only by default', async () => {
    store.association_pole_members = [
      member(),
      member({ id: 'other', is_active: false }),
    ] as any;
    const res = makeRes();
    await poleMembersHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items.map((m: any) => m.id)).toEqual([MEMBER_ID]);
  });

  it('POST 400 on an unknown pole', async () => {
    const res = makeRes();
    await poleMembersHandler(
      makeReq({ method: 'POST', body: { name: 'Bob', poleKey: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid or missing poleKey.');
  });

  it('POST 201 creates, logs and regenerates /association', async () => {
    store.association_pole_members = [] as any;
    store.staff_logs = [] as any;
    const res = makeRes();
    await poleMembersHandler(
      makeReq({
        method: 'POST',
        body: { name: '  Bob ', poleKey: 'direction' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('Bob');
    expect(res.revalidated).toContain('/association');
    expect(
      (store.staff_logs as any[]).some((l) => l.action === 'create_pole_member')
    ).toBe(true);
  });

  it('403 below manage_communications', async () => {
    store.staff = [staffRow('caster')] as any;
    const res = makeRes();
    await poleMembersHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('/api/admin/pole-members/[id]', () => {
  it('400 on an invalid id', async () => {
    const res = makeRes();
    await poleMemberByIdHandler(makeReq({ query: { id: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing or invalid ID.');
  });

  it('GET 404 when missing', async () => {
    store.association_pole_members = [] as any;
    const res = makeRes();
    await poleMemberByIdHandler(makeReq({ query: { id: MEMBER_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Pole member not found.');
  });

  it('PATCH 400 on an empty name', async () => {
    store.association_pole_members = [member()] as any;
    const res = makeRes();
    await poleMemberByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: MEMBER_ID },
        body: { name: ' ' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Name cannot be empty.');
  });

  it('PATCH updates the member', async () => {
    store.association_pole_members = [member()] as any;
    const res = makeRes();
    await poleMemberByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: MEMBER_ID },
        body: { title: 'Présidente' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.association_pole_members as any[])[0].title).toBe(
      'Présidente'
    );
  });

  it('DELETE answers 204 and regenerates /association', async () => {
    store.association_pole_members = [member()] as any;
    const res = makeRes();
    await poleMemberByIdHandler(
      makeReq({ method: 'DELETE', query: { id: MEMBER_ID } }),
      res
    );
    expect(res.statusCode).toBe(204);
    expect(res.revalidated).toContain('/association');
    expect(store.association_pole_members as any[]).toHaveLength(0);
  });
});
