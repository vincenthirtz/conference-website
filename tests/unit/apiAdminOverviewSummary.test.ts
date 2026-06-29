import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import overviewSummaryHandler from '../../pages/api/admin/overview-summary';

/* -----------------------------------------------------------
 * Helpers (same shape as the apiRoutesBatch* admin suites)
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
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

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = false): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
});

/* -----------------------------------------------------------
 * /api/admin/overview-summary
 * ---------------------------------------------------------*/

describe('GET /api/admin/overview-summary', () => {
  it('401 without token', async () => {
    const res = makeRes();
    await overviewSummaryHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when role is below manager (caster)', async () => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('caster')] as any;
    const res = makeRes();
    await overviewSummaryHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(403);
  });

  it('405 on non-GET', async () => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
    const res = makeRes();
    await overviewSummaryHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });

  it('200 returns the 6 numeric KPI keys with the expected counts', async () => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;

    const t = CONFERENCE_TENANT_ID;

    // tournamentsActive = status 'running' (tenant) → expect 1
    store.tournaments = [
      { id: 'tr-1', tenant_id: t, status: 'running' },
      { id: 'tr-2', tenant_id: t, status: 'draft' },
      { id: 'tr-3', tenant_id: t, status: 'finished' },
    ] as any;

    // teams = total (tenant) → expect 2
    store.teams = [
      { id: 'tm-1', tenant_id: t },
      { id: 'tm-2', tenant_id: t },
    ] as any;

    // demandesPending = status 'pending' (tenant) → expect 3
    store.demandes = [
      { id: 'd-1', tenant_id: t, status: 'pending' },
      { id: 'd-2', tenant_id: t, status: 'pending' },
      { id: 'd-3', tenant_id: t, status: 'pending' },
      { id: 'd-4', tenant_id: t, status: 'approved' },
    ] as any;

    // support_tickets = GLOBAL (no tenant_id). open → 2 ; high & not
    // resolved/closed → 1 (the 'closed' high one is excluded).
    store.support_tickets = [
      { id: 's-1', status: 'open', severity: 'low' },
      { id: 's-2', status: 'open', severity: 'medium' },
      { id: 's-3', status: 'in_progress', severity: 'high' },
      { id: 's-4', status: 'closed', severity: 'high' },
      { id: 's-5', status: 'resolved', severity: 'high' },
    ] as any;

    // disputesOpen = matches status 'disputed' (tenant) → expect 1
    store.matches = [
      { id: 'mt-1', tenant_id: t, status: 'disputed' },
      { id: 'mt-2', tenant_id: t, status: 'ongoing' },
    ] as any;

    const res = makeRes();
    await overviewSummaryHandler(makeReq({ method: 'GET' }, true), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'demandesPending',
        'disputesOpen',
        'supportHigh',
        'supportOpen',
        'teams',
        'tournamentsActive',
      ].sort()
    );
    for (const v of Object.values(body)) {
      expect(typeof v).toBe('number');
    }
    expect(body).toEqual({
      tournamentsActive: 1,
      teams: 2,
      demandesPending: 3,
      supportOpen: 2,
      supportHigh: 1,
      disputesOpen: 1,
    });
  });

  it('200 with zeros when every table is empty', async () => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;

    const res = makeRes();
    await overviewSummaryHandler(makeReq({ method: 'GET' }, true), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      tournamentsActive: 0,
      teams: 0,
      demandesPending: 0,
      supportOpen: 0,
      supportHigh: 0,
      disputesOpen: 0,
    });
  });
});
