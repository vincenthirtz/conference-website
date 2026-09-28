// GET /api/admin/diffusion/live-status — le point rouge de la barre Diffusion.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import handler from '../../pages/api/admin/diffusion/live-status';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER = '00000000-0000-4000-8000-00000000000a';

let _n = 0;
function makeReq(): any {
  _n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_n}` },
    cookies: {},
    query: {},
    body: {},
  };
}
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  // Une CASTEUSE : l'information sert à tout le staff de la diffusion.
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'c@x.com',
      role: 'caster',
      is_pole_admin: false,
    },
  ] as any;
});

describe('GET /api/admin/diffusion/live-status', () => {
  it('rien en direct → live: false', async () => {
    store.event_runs = [
      { id: 'r1', tenant_id: TENANT, name: 'Brouillon', status: 'draft' },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ live: false, runName: null });
  });

  it('un run en direct → son nom', async () => {
    store.event_runs = [
      {
        id: 'r2',
        tenant_id: TENANT,
        name: 'Soirée Cup',
        status: 'live',
        started_at: '2026-09-28T18:00:00Z',
      },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.body).toEqual({ live: true, runName: 'Soirée Cup' });
  });

  it('ignore le direct d’un AUTRE espace', async () => {
    store.event_runs = [
      { id: 'r3', tenant_id: OTHER, name: 'Ailleurs', status: 'live' },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.body.live).toBe(false);
  });
});
