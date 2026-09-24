// tests/unit/apiAdminOverlayDay.test.ts
//
// PUT/GET /api/admin/tournament/[id]/overlay-day — le jour forcé de la source
// OBS « Matchs du jour ». Couvert : poser, lire, retirer, refuser une date
// illisible, cloisonnement par espace.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/tournament/[id]/overlay-day';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TOURNAMENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FOREIGN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function seed() {
  const staff: StaffMember = {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'owner',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
  store.staff = [staff] as any;
  store.tenants = [
    { id: TENANT, slug: 'alpha', name: 'Alpha', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-1', role: 'owner' },
  ] as any;
  store.tournaments = [
    {
      id: TOURNAMENT,
      tenant_id: TENANT,
      overlay_day_date: null,
      overlay_day_set_at: null,
    },
    {
      id: FOREIGN,
      tenant_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      overlay_day_date: null,
      overlay_day_set_at: null,
    },
  ] as any;
}

function call(id: string, method: string, body: unknown = {}) {
  const res: any = {
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
  return handler(
    {
      method,
      headers: { host: 'h', authorization: 'Bearer t-1' },
      cookies: {},
      query: { id },
      body,
    } as any,
    res
  ).then(() => res);
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seed();
});

describe('/api/admin/tournament/[id]/overlay-day', () => {
  it('pose le jour forcé, le relit actif, puis le retire', async () => {
    const put = await call(TOURNAMENT, 'PUT', { date: '2026-09-23' });
    expect(put.statusCode).toBe(200);
    expect(put.body).toMatchObject({ date: '2026-09-23', active: true });
    expect(put.body.expiresAt).toBeTruthy();

    const got = await call(TOURNAMENT, 'GET');
    expect(got.body).toMatchObject({ date: '2026-09-23', active: true });

    const reset = await call(TOURNAMENT, 'PUT', { date: null });
    expect(reset.body).toMatchObject({ date: null, active: false });
    expect((store.tournaments as any)[0].overlay_day_set_at).toBeNull();
  });

  it('refuse une date illisible', async () => {
    expect((await call(TOURNAMENT, 'PUT', { date: '23/09' })).statusCode).toBe(
      400
    );
    expect(
      (await call(TOURNAMENT, 'PUT', { date: '2026-02-30' })).statusCode
    ).toBe(400);
  });

  it('ne touche pas au tournoi d’un autre espace', async () => {
    const res = await call(FOREIGN, 'PUT', { date: '2026-09-23' });
    expect(res.statusCode).toBe(404);
    expect((store.tournaments as any)[1].overlay_day_date).toBeNull();
  });
});
