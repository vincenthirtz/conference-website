// tests/unit/apiAdminTeamRosterLock.test.ts
//
// GET/POST/DELETE /api/admin/teams/[teamId]/roster-lock — dérogation de roster
// PAR ÉQUIPE.
//
// Pourquoi une portée par équipe existe à côté de celle du tournoi : « une
// joueuse s'est blessée chez les Alpha » n'est pas un motif pour rouvrir le
// roster de toutes les équipes la veille des matchs. La fenêtre vit donc sur
// l'inscription, et se cumule avec celle du tournoi au sens le plus permissif.
//
// Ce que ces tests protègent :
//   - on ne peut ouvrir une fenêtre que sur un tournoi où l'équipe EST
//     inscrite (sinon on écrirait dans le vide, sans erreur) ;
//   - le GET distingue les trois situations que l'écran doit savoir montrer :
//     verrouillé, ouvert pour l'équipe, ouvert pour tout le tournoi ;
//   - le scope tenant, et les bornes de durée.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import handler from '../../pages/api/admin/teams/[teamId]/roster-lock';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TEAM = '21e7e75f-0a79-4036-bf1b-b730a0a26766';
const T_LOCKED = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const T_OPEN_ALL = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
const T_NOT_REGISTERED = 'aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa';
const STAFF_ID = 'staff-1';

const PAST = new Date(Date.now() - 3_600_000).toISOString();
const FUTURE = new Date(Date.now() + 3_600_000).toISOString();

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: { teamId: TEAM },
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
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
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'admin',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [{ id: TENANT, slug: 'conf', name: 'Conf', is_active: true }] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
  store.teams = [{ id: TEAM, tenant_id: TENANT, name: 'Alpha' }] as any;
  store.tournaments = [
    {
      id: T_LOCKED,
      tenant_id: TENANT,
      name: 'Coupe Hiver',
      status: 'running',
      roster_locked_at: PAST,
      roster_unlocked_until: null,
    },
    {
      id: T_OPEN_ALL,
      tenant_id: TENANT,
      name: 'Championnat',
      status: 'running',
      roster_locked_at: PAST,
      roster_unlocked_until: FUTURE,
    },
  ] as any;
  store.tournament_teams = [
    {
      tenant_id: TENANT,
      team_id: TEAM,
      tournament_id: T_LOCKED,
      roster_unlocked_until: null,
    },
    {
      tenant_id: TENANT,
      team_id: TEAM,
      tournament_id: T_OPEN_ALL,
      roster_unlocked_until: null,
    },
  ] as any;
});

describe('GET — état par tournoi', () => {
  it('distingue verrouillé et ouvert par le tournoi', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);

    const rows = (res.body as any).tournaments as any[];
    const locked = rows.find((r) => r.tournamentId === T_LOCKED);
    const open = rows.find((r) => r.tournamentId === T_OPEN_ALL);

    expect(locked.locks).toBe(true);
    expect(locked.teamUnlockedUntil).toBeNull();

    // Ouvert pour tout le monde : l'écran doit le dire, sinon l'admin rouvre
    // ce qui est déjà ouvert — ou ne comprend pas pourquoi ça passe.
    expect(open.locks).toBe(false);
    expect(open.tournamentUnlockedUntil).toBe(FUTURE);
  });

  it('remonte ce qui bloque en premier', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const rows = (res.body as any).tournaments as any[];
    expect(rows[0].tournamentId).toBe(T_LOCKED);
  });

  it('une équipe sans inscription renvoie une liste vide', async () => {
    store.tournament_teams = [] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).tournaments).toEqual([]);
  });

  it('404 sur une équipe d’un autre espace', async () => {
    (store.teams as any[])[0].tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('POST — ouvrir pour cette équipe', () => {
  it('ouvre une fenêtre sur l’inscription, pas sur le tournoi', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { tournamentId: T_LOCKED, minutes: 30 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);

    const reg = (store.tournament_teams as any[]).find(
      (r) => r.tournament_id === T_LOCKED
    );
    expect(reg.roster_unlocked_until).toBeTruthy();
    // Le tournoi n'a pas bougé : les autres équipes restent verrouillées.
    expect(
      (store.tournaments as any[]).find((t) => t.id === T_LOCKED)
        .roster_unlocked_until
    ).toBeNull();
  });

  it('refuse un tournoi où l’équipe n’est pas inscrite', async () => {
    // Sinon l'update ne toucherait aucune ligne et l'écran afficherait un
    // succès pour un geste sans effet.
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', body: { tournamentId: T_NOT_REGISTERED } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('NOT_REGISTERED');
  });

  it('refuse une durée hors bornes', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { tournamentId: T_LOCKED, minutes: 4000 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_MINUTES');
  });
});

describe('DELETE — refermer', () => {
  it('referme la fenêtre de l’équipe', async () => {
    (store.tournament_teams as any[])[0].roster_unlocked_until = FUTURE;
    const res = makeRes();
    await handler(
      makeReq({ method: 'DELETE', body: { tournamentId: T_LOCKED } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.tournament_teams as any[])[0].roster_unlocked_until
    ).toBeNull();
  });
});
