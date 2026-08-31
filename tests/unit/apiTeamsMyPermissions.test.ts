// GET/PATCH /api/admin/teams/my — permissions fines et scope tenant.
//
// Route « côté capitaine » (malgré son chemin /admin) : elle sert la tranche
// équipe à l'espace joueur ET écrit les infos de l'équipe. Deux trous s'y
// cachaient :
//
//  1. le PATCH n'exigeait AUCUNE permission fine. Tout rôle accordant au moins
//     une permission — un coach, qui n'a que les scrims et la feuille de match —
//     pouvait renommer l'équipe, changer son logo, sa description, son SR.
//  2. `getManagedTeam` y était appelé sans tenantId, donc sur DEFAULT_TENANT_ID
//     (le bug S5c que le GET avait déjà corrigé de son côté).
//
// Le GET, lui, doit désormais publier `permissions` : c'est ce que le client
// utilise pour ne montrer que les gestes qui aboutiront.

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
import handler from '../../pages/api/admin/teams/my';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COACH_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

let _t = 0;
function makeReq(over: Partial<any> = {}): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const team = () => (store.teams as any[]).find((t) => t.id === TEAM_ID);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      slug: 'alpha',
      name: 'Alpha',
      short_name: 'ALP',
      logo_url: null,
      country: 'FR',
      description: null,
      captain_id: CAPTAIN_ID,
      is_active: true,
      is_joinable: false,
      open_for_scrim: false,
      skill_rating: null,
    },
  ] as any;
  store.team_members = [
    {
      id: 'm-cap',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'player',
      battle_tag: 'Cap#1',
      is_substitute: false,
    },
    {
      id: 'm-coach',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      user_id: COACH_ID,
      role: 'coach',
      display_name: 'Coach',
      battle_tag: null,
      is_substitute: false,
    },
  ] as any;
});

describe('GET /api/admin/teams/my — permissions publiées', () => {
  it('la capitaine reçoit TOUTES les permissions', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const b = res.body as any;
    expect(b.isCaptain).toBe(true);
    expect(b.permissions).toEqual(
      expect.arrayContaining(['manage_roster', 'manage_team_info'])
    );
  });

  it('le coach ne reçoit que les siennes — scrims + feuille de match', async () => {
    setAuthUser({ id: COACH_ID });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const b = res.body as any;
    // `isManager` reste vrai : c'est bien « un rôle à privilèges ». C'est
    // exactement pour ça que le client ne peut pas s'en contenter.
    expect(b.isManager).toBe(true);
    expect(b.permissions).toEqual(['manage_scrims', 'validate_lineup']);
  });
});

describe('PATCH /api/admin/teams/my — manage_team_info', () => {
  it('la capitaine renomme son équipe', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await handler(
      makeReq({ method: 'PATCH', body: { teamId: TEAM_ID, name: 'Omega' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(team().name).toBe('Omega');
  });

  it('le coach est refusé — et rien n’est écrit', async () => {
    setAuthUser({ id: COACH_ID });
    const res = makeRes();
    await handler(
      makeReq({ method: 'PATCH', body: { teamId: TEAM_ID, name: 'Omega' } }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect(team().name).toBe('Alpha');
  });
});
