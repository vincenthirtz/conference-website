// tests/unit/apiCasterRecentMatches.test.ts
//
// LA LISTE DE MATCHS DU COCKPIT — celle qui rattache un scrutin MVP du public
// à un vrai match.
//
// POURQUOI CETTE ROUTE EXISTE, ET CE QUE CES TESTS TIENNENT. Un caster n'a
// qu'UNE permission : `use_cast_cockpit`. L'endpoint de recherche de matchs
// déjà présent est gardé par `arbitrate_matches`, qu'il n'a pas — le sélecteur
// aurait rendu 403 aux personnes qui tiennent réellement la régie. D'où une
// route étroite, et le premier test : un caster DOIT pouvoir l'appeler.
//
// Le second garde-fou est l'exclusion des forfaits et des byes. Il n'y a pas
// eu de partie, donc personne à élire ; les laisser dans la liste ne
// produirait qu'un 409 au clic, en plein direct, sans que la régie comprenne
// pourquoi.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

import handler from '../../pages/api/admin/caster/recent-matches';

const TENANT = DEFAULT_TENANT_ID;
const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';
const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';

const M_JOUE = '11111111-1111-4111-8111-11111111000a';
const M_ENCOURS = '11111111-1111-4111-8111-11111111000b';
const M_FORFAIT = '11111111-1111-4111-8111-11111111000c';
const M_BYE = '11111111-1111-4111-8111-11111111000d';

let _n = 0;
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

async function call(method = 'GET') {
  _n += 1;
  const req: any = {
    method,
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${_n}`,
      'x-nf-client-connection-ip': `10.1.${Math.floor(_n / 250)}.${_n % 250}`,
    },
    cookies: {},
    query: {},
    body: {},
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

function seedStaff(role: 'caster' | 'helper') {
  store.staff = [
    {
      id: STAFF_ROW,
      auth_user_id: STAFF_AUTH,
      email: 'staff@example.com',
      role,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ROW, role, created_at: '2026-01-01' },
  ] as any;
  setAuthUser({ id: STAFF_AUTH });
  invalidateStaffCache();
}

describe('/api/admin/caster/recent-matches', () => {
  beforeEach(() => {
    resetSupabaseMock();
    store.tenants = [
      {
        id: TENANT,
        plan: 'foundation',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ] as any;
    store.teams = [
      { id: TEAM_A, tenant_id: TENANT, name: 'Les Alpines' },
      { id: TEAM_B, tenant_id: TENANT, name: 'Les Bravos' },
    ] as any;
    store.matches = [
      {
        id: M_JOUE,
        tenant_id: TENANT,
        status: 'finished',
        round_name: 'J1',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        completed_at: '2026-09-20T20:00:00.000Z',
        is_bye: false,
        forfeit_team_id: null,
      },
      {
        id: M_ENCOURS,
        tenant_id: TENANT,
        status: 'ongoing',
        round_name: 'J1',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        completed_at: null,
        is_bye: false,
        forfeit_team_id: null,
      },
      {
        id: M_FORFAIT,
        tenant_id: TENANT,
        status: 'finished',
        round_name: 'J1',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        completed_at: '2026-09-20T18:00:00.000Z',
        is_bye: false,
        forfeit_team_id: TEAM_B,
      },
      {
        id: M_BYE,
        tenant_id: TENANT,
        status: 'finished',
        round_name: 'J1',
        team1_id: TEAM_A,
        team2_id: null,
        completed_at: '2026-09-20T17:00:00.000Z',
        is_bye: true,
        forfeit_team_id: null,
      },
    ] as any;
    seedStaff('caster');
  });

  it('est ouverte au CASTER — c’est toute sa raison d’être', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
  });

  it('rend les matchs joués, avec le nom des deux équipes', async () => {
    const res = await call();
    const ids = res.body.matches.map((m: any) => m.id);
    expect(ids).toContain(M_JOUE);
    const joue = res.body.matches.find((m: any) => m.id === M_JOUE);
    expect(joue.team1Name).toBe('Les Alpines');
    expect(joue.team2Name).toBe('Les Bravos');
    expect(joue.roundName).toBe('J1');
  });

  it('écarte forfaits et byes : il n’y a personne à élire', async () => {
    const res = await call();
    const ids = res.body.matches.map((m: any) => m.id);
    expect(ids).not.toContain(M_FORFAIT);
    expect(ids).not.toContain(M_BYE);
  });

  it('n’expose pas les matchs en cours', async () => {
    const res = await call();
    const ids = res.body.matches.map((m: any) => m.id);
    expect(ids).not.toContain(M_ENCOURS);
  });

  it('refuse un rôle sous le caster', async () => {
    seedStaff('helper');
    const res = await call();
    expect([401, 403]).toContain(res.statusCode);
  });

  it('refuse une autre méthode que GET', async () => {
    const res = await call('POST');
    expect(res.statusCode).toBe(405);
  });
});
