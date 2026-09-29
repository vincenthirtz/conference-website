// tests/unit/apiAdminTournamentModule.test.ts
//
// Routes du module `features/admin/tournaments` qui n'avaient AUCUN test avant
// leur migration sur `defineAdminRoute` (vague serveur 3) : analytics,
// checkin-settings, checkin-nudge-all. Test minimal : scope tenant, codes et
// messages historiques, journal écrit avec son slug.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import analyticsHandler from '../../pages/api/admin/tournament/[id]/analytics';
import checkinSettingsHandler from '../../pages/api/admin/tournament/[id]/checkin-settings';
import nudgeAllHandler from '../../pages/api/admin/tournament/[id]/checkin-nudge-all';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOURNAMENT = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FOREIGN_TOURNAMENT = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
const TEAM_A = 'cccccccc-1111-4111-8111-cccccccccccc';
const TEAM_B = 'cccccccc-2222-4222-8222-cccccccccccc';
const MATCH = 'dddddddd-1111-4111-8111-dddddddddddd';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: { id: TOURNAMENT },
    body: {},
    ...over,
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
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'admin',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'conference', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-1', role: 'admin' },
  ] as any;
  store.tournaments = [
    {
      id: TOURNAMENT,
      tenant_id: TENANT,
      name: 'Coupe',
      slug: 'coupe',
      checkin_grace_minutes: 45,
    },
    { id: FOREIGN_TOURNAMENT, tenant_id: OTHER_TENANT, name: 'Ailleurs' },
  ] as any;
  store.teams = [
    { id: TEAM_A, tenant_id: TENANT, name: 'Alpha' },
    { id: TEAM_B, tenant_id: TENANT, name: 'Bravo' },
  ] as any;
  store.matches = [] as any;
  store.staff_logs = [] as any;
});

describe('GET …/[id]/analytics', () => {
  it('400 sur un id mal formé (message historique)', async () => {
    const res = makeRes();
    await analyticsHandler(makeReq({ query: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid tournament id');
  });

  it('404 sur un tournoi d’un autre espace', async () => {
    const res = makeRes();
    await analyticsHandler(makeReq({ query: { id: FOREIGN_TOURNAMENT } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('agrège les matchs du tournoi', async () => {
    store.matches = [
      {
        id: MATCH,
        tenant_id: TENANT,
        tournament_id: TOURNAMENT,
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        winner_team_id: TEAM_A,
        status: 'finished',
        is_bye: false,
      },
    ] as any;
    const res = makeRes();
    await analyticsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.tournament).toEqual({
      id: TOURNAMENT,
      name: 'Coupe',
      slug: 'coupe',
    });
    expect(res.body.analytics).toBeTruthy();
    expect(res.body.tiers).toBeTruthy();
    expect(Array.isArray(res.body.duels)).toBe(true);
  });
});

describe('…/[id]/checkin-settings', () => {
  it('GET rend le délai de grâce du tournoi', async () => {
    const res = makeRes();
    await checkinSettingsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.checkinGraceMinutes).toBe(45);
    expect(res.body.migrated).toBe(true);
  });

  it('PATCH refuse une valeur hors bornes (message historique)', async () => {
    const res = makeRes();
    await checkinSettingsHandler(
      makeReq({ method: 'PATCH', body: { checkinGraceMinutes: 500 } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/entre 0 et 120/);
  });

  it('PATCH écrit et journalise `update_tournament`', async () => {
    const res = makeRes();
    await checkinSettingsHandler(
      makeReq({ method: 'PATCH', body: { checkinGraceMinutes: '30' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, checkinGraceMinutes: 30 });
    expect((store.tournaments as any[])[0].checkin_grace_minutes).toBe(30);
    const log = (store.staff_logs as any[]).at(-1);
    expect(log.action).toBe('update_tournament');
    // `permission` rejoint le payload (logStaffAction) : on ne fige que le reste.
    expect(log.payload).toMatchObject({
      kind: 'checkin_settings_update',
      checkin_grace_minutes: 30,
    });
  });
});

describe('POST …/[id]/checkin-nudge-all', () => {
  it('405 sur GET', async () => {
    const res = makeRes();
    await nudgeAllHandler(makeReq(), res);
    expect(res.statusCode).toBe(405);
  });

  it('sans match imminent : rien relancé, journal `checkin_manual_nudge`', async () => {
    const res = makeRes();
    await nudgeAllHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, nudged: 0, matches: 0 });
    const log = (store.staff_logs as any[]).at(-1);
    expect(log.action).toBe('checkin_manual_nudge');
    expect(log.payload).toMatchObject({
      scope: 'all_missing',
      nudged: 0,
      matches: [],
    });
  });
});
