// GET /api/admin/diffusion/twitch-channels — le statut d'antenne vu par les
// casteuses : chaînes actives de l'espace du staff, en lecture seule.

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
import handler from '../../pages/api/admin/diffusion/twitch-channels';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER = '00000000-0000-4000-8000-00000000000a';

let _n = 0;
function makeReq(method = 'GET'): any {
  _n += 1;
  return {
    method,
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
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'c@x.com',
      role: 'caster',
      is_pole_admin: false,
    },
  ] as any;
  store.twitch_channels = [
    {
      channel: 'womens_cup',
      label: 'Cup',
      tenant_id: TENANT,
      is_active: true,
      sort_order: 0,
    },
    {
      channel: 'vieille',
      label: 'Old',
      tenant_id: TENANT,
      is_active: false,
      sort_order: 1,
    },
    {
      channel: 'ailleurs',
      label: 'X',
      tenant_id: OTHER,
      is_active: true,
      sort_order: 0,
    },
  ] as any;
});

describe('GET /api/admin/diffusion/twitch-channels', () => {
  it('ouvert à une casteuse : les chaînes actives de SON espace', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toEqual([{ channel: 'womens_cup', label: 'Cup' }]);
  });

  it('lecture seule', async () => {
    const res = makeRes();
    await handler(makeReq('POST'), res);
    expect(res.statusCode).toBe(405);
  });
});
