// tests/unit/apiAdminTeamHistory.test.ts
//
// GET /api/admin/teams/[teamId]/history — historique staff d'une équipe.
//
// La route existait depuis longtemps sans aucun appelant. En la branchant sur
// la fiche d'équipe, deux défauts sont devenus visibles — invisibles tant que
// personne ne lisait la réponse :
//
//   - elle additionne DEUX requêtes (logs posés sur l'équipe, logs qui la
//     citent dans leur payload). Un log qui coche les deux revenait en double :
//     à l'écran, deux gestes là où il n'y en avait qu'un ;
//   - `limit` s'appliquait à chaque requête, pas au résultat. Demander 20
//     pouvait en rendre 40, et l'appelant qui compte sur ce nombre pour dire
//     « il y a une suite » se trompait.
//
// Ces tests tiennent les deux, plus le cloisonnement par espace.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/teams/[teamId]/history';

const USER = 'user-1';
const TEAM = '21e7e75f-0a79-4036-bf1b-b730a0a26766';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let _t = 0;
function makeReq(query: Record<string, string> = {}): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    cookies: {},
    query: { teamId: TEAM, ...query },
    body: {},
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

function log(over: Record<string, unknown>) {
  return {
    tenant_id: CONFERENCE_TENANT_ID,
    created_at: '2026-08-01T10:00:00.000Z',
    staff_id: 'staff-1',
    action: 'update_team',
    entity_type: 'team',
    entity_id: TEAM,
    tournament_id: null,
    payload: {},
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'a@a.com',
      role: 'admin',
      display_name: 'Admin',
      avatar_url: null,
      is_active: true,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.staff_logs = [] as any;
});

describe('GET /api/admin/teams/[teamId]/history', () => {
  it('ne compte qu’une fois un log qui coche les deux filtres', async () => {
    // Posé SUR l'équipe et citant l'équipe dans son payload : les deux
    // requêtes le ramènent.
    store.staff_logs = [
      log({ id: 'log-both', payload: { team_id: TEAM, action: 'provision' } }),
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const logs = (res.body as any).logs as any[];
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe('log-both');
  });

  it('rend les logs qui citent l’équipe sans lui être attachés', async () => {
    // Cas typique : un match créé, l'équipe n'est pas l'entité du log.
    store.staff_logs = [
      log({
        id: 'log-match',
        entity_type: 'match',
        entity_id: 'match-1',
        action: 'create_match',
        payload: { team_id: TEAM },
      }),
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    const logs = (res.body as any).logs as any[];
    expect(logs.map((l) => l.id)).toEqual(['log-match']);
  });

  it('coupe au nombre demandé, pas au double', async () => {
    // 2 logs attachés + 2 logs cités : sans coupe finale, `limit=2` en rendait
    // jusqu'à 4.
    store.staff_logs = [
      log({ id: 'a1', created_at: '2026-08-04T10:00:00.000Z' }),
      log({ id: 'a2', created_at: '2026-08-03T10:00:00.000Z' }),
      log({
        id: 'p1',
        entity_type: 'match',
        entity_id: 'm1',
        created_at: '2026-08-02T10:00:00.000Z',
        payload: { team_id: TEAM },
      }),
      log({
        id: 'p2',
        entity_type: 'match',
        entity_id: 'm2',
        created_at: '2026-08-01T10:00:00.000Z',
        payload: { team_id: TEAM },
      }),
    ] as any;

    const res = makeRes();
    await handler(makeReq({ limit: '2' }), res);
    const logs = (res.body as any).logs as any[];
    expect(logs).toHaveLength(2);
    // Les plus récents d'abord : c'est ce que l'écran montre en premier.
    expect(logs.map((l) => l.id)).toEqual(['a1', 'a2']);
  });

  it('ignore le journal d’un autre espace', async () => {
    store.staff_logs = [
      log({ id: 'mine' }),
      log({ id: 'ailleurs', tenant_id: OTHER_TENANT }),
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    const logs = (res.body as any).logs as any[];
    expect(logs.map((l) => l.id)).toEqual(['mine']);
  });

  it('refuse un teamId qui n’est pas un UUID', async () => {
    const res = makeRes();
    await handler(makeReq({ teamId: 'pas-un-uuid' }), res);
    expect(res.statusCode).toBe(400);
  });
});
