// DELETE /api/admin/events/[runId] — un run EN DIRECT ne se supprime pas.
// Cockpit, console live et overlay /overlay/[runId] le suivent : un clic de
// travers effaçait l'antenne.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/events/[runId]/index';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const RUN = '11111111-1111-4111-8111-111111111111';

let _n = 0;
function makeReq(runId: string): any {
  _n += 1;
  return {
    method: 'DELETE',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_n}` },
    cookies: {},
    query: { runId },
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

function seedRun(status: string) {
  store.event_runs = [
    { id: RUN, tenant_id: TENANT, name: 'Soirée', slug: 'soiree', status },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'a@x.com',
      role: 'owner',
      is_pole_admin: false,
    },
  ] as any;
});

describe('DELETE /api/admin/events/[runId]', () => {
  it('refuse un run en direct (409 run_live) et ne l’efface pas', async () => {
    seedRun('live');
    const res = makeRes();
    await handler(makeReq(RUN), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('run_live');
    expect((store.event_runs as any[]).length).toBe(1);
  });

  it('supprime un brouillon', async () => {
    seedRun('draft');
    const res = makeRes();
    await handler(makeReq(RUN), res);
    expect(res.statusCode).toBeLessThan(300);
    expect((store.event_runs as any[]).length).toBe(0);
  });

  it('supprime un run terminé', async () => {
    seedRun('ended');
    const res = makeRes();
    await handler(makeReq(RUN), res);
    expect(res.statusCode).toBeLessThan(300);
    expect((store.event_runs as any[]).length).toBe(0);
  });
});
