// Manager multi-équipes : un compte `manager` encadre PLUSIEURS équipes.
//
// Rendu possible par database/migrations/allow_manager_multi_team.sql, qui
// remplace la contrainte UNIQUE (tenant_id, user_id) par un index PARTIEL
// excluant le seul rôle `manager`. Côté application, deux choses devaient
// suivre, et ce sont elles qu'on teste ici :
//
//   1. `getManagedTeams` doit RENDRE la liste (l'ancien `.maybeSingle()`
//      tombait en erreur dès la deuxième équipe) ;
//   2. les routes de gestion doivent agir sur l'équipe DEMANDÉE (`?teamId=`),
//      et refuser une équipe non encadrée — sans quoi un manager piloterait
//      une équipe au hasard pendant que son écran en affiche une autre.
//
// Cibles : utils/teams/managementAccess.ts, utils/teams/teamScope.ts,
//          pages/api/teams/toggle-joinable.ts (représentante des ~30 routes).

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import {
  getManagedTeam,
  getManagedTeams,
} from '../../utils/teams/managementAccess';
import { readRequestedTeamId } from '../../utils/teams/teamScope';

import toggleJoinableHandler from '../../pages/api/teams/toggle-joinable';

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEAM_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MANAGER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CAPTAIN_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

let _tokenCounter = 0;
function makeAuthedReq(over: Partial<any> = {}): any {
  _tokenCounter += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${_tokenCounter}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Un manager sur A et B (dans cet ordre), une équipe C qu'il n'encadre pas. */
function seedMultiTeamManager() {
  store.teams = [
    {
      id: TEAM_A,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      is_active: true,
      is_joinable: false,
    },
    {
      id: TEAM_B,
      name: 'Bravo',
      captain_id: CAPTAIN_ID,
      is_active: true,
      is_joinable: false,
    },
    {
      id: TEAM_C,
      name: 'Charlie',
      captain_id: CAPTAIN_ID,
      is_active: true,
      is_joinable: false,
    },
  ] as any;
  store.team_members = [
    { id: 'm-a', team_id: TEAM_A, user_id: MANAGER_ID, role: 'manager' },
    { id: 'm-b', team_id: TEAM_B, user_id: MANAGER_ID, role: 'manager' },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: MANAGER_ID });
  seedMultiTeamManager();
});

describe('getManagedTeams', () => {
  it('rend TOUTES les équipes encadrées', async () => {
    const accesses = await getManagedTeams(MANAGER_ID);
    expect(accesses.map((a) => a.teamId)).toEqual([TEAM_A, TEAM_B]);
    expect(accesses.every((a) => a.isManager && !a.isCaptain)).toBe(true);
    // Le rôle `manager` porte toutes les permissions par défaut.
    expect(accesses[0].permissions.length).toBeGreaterThan(0);
  });

  it('la capitainerie passe devant, et une équipe n’apparaît qu’une fois', async () => {
    // Capitaine de C, manager de A et B : C d'abord (permissions les plus
    // larges), et pas de doublon si l'on est aussi membre privilégié.
    store.teams = store.teams.map((t: any) =>
      t.id === TEAM_C ? { ...t, captain_id: MANAGER_ID } : t
    ) as any;
    store.team_members = [
      ...store.team_members,
      { id: 'm-c', team_id: TEAM_C, user_id: MANAGER_ID, role: 'manager' },
    ] as any;

    const accesses = await getManagedTeams(MANAGER_ID);
    expect(accesses.map((a) => a.teamId)).toEqual([TEAM_C, TEAM_A, TEAM_B]);
    expect(accesses[0]).toMatchObject({ isCaptain: true, isManager: false });
  });

  it('rend une liste vide quand on ne gère rien', async () => {
    expect(
      await getManagedTeams('99999999-9999-9999-9999-999999999999')
    ).toEqual([]);
  });
});

describe('getManagedTeam scopé', () => {
  it('rend l’équipe demandée, pas la première', async () => {
    const access = await getManagedTeam(MANAGER_ID, undefined, TEAM_B);
    expect(access?.teamId).toBe(TEAM_B);
  });

  it('refuse une équipe non encadrée — `?teamId=` n’élargit jamais la portée', async () => {
    expect(await getManagedTeam(MANAGER_ID, undefined, TEAM_C)).toBeNull();
  });

  it('sans équipe demandée, retombe sur la première (comportement historique)', async () => {
    const access = await getManagedTeam(MANAGER_ID);
    expect(access?.teamId).toBe(TEAM_A);
  });
});

describe('readRequestedTeamId', () => {
  it('lit la query', () => {
    expect(
      readRequestedTeamId(makeAuthedReq({ query: { teamId: TEAM_B } }))
    ).toBe(TEAM_B);
  });

  it('ignore une valeur qui n’est pas un UUID plutôt que de faire échouer la route', () => {
    expect(
      readRequestedTeamId(makeAuthedReq({ query: { teamId: 'nope' } }))
    ).toBeNull();
    expect(readRequestedTeamId(makeAuthedReq({ query: {} }))).toBeNull();
  });

  it('ne lit JAMAIS le body : `body.teamId` désigne autre chose selon les routes', () => {
    expect(
      readRequestedTeamId(makeAuthedReq({ body: { teamId: TEAM_B } }))
    ).toBeNull();
  });
});

describe('route de gestion (toggle-joinable) avec ?teamId=', () => {
  it('agit sur l’équipe demandée', async () => {
    const req = makeAuthedReq({
      method: 'POST',
      query: { teamId: TEAM_B },
      body: { joinable: true },
    });
    const res = makeRes();
    await toggleJoinableHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(store.teams.find((t: any) => t.id === TEAM_B)?.is_joinable).toBe(
      true
    );
    // L'autre équipe encadrée n'a pas bougé : c'est tout l'objet du paramètre.
    expect(store.teams.find((t: any) => t.id === TEAM_A)?.is_joinable).toBe(
      false
    );
  });

  it('refuse une équipe non encadrée', async () => {
    const req = makeAuthedReq({
      method: 'POST',
      query: { teamId: TEAM_C },
      body: { joinable: true },
    });
    const res = makeRes();
    await toggleJoinableHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(store.teams.find((t: any) => t.id === TEAM_C)?.is_joinable).toBe(
      false
    );
  });

  it('sans paramètre, retombe sur la première équipe encadrée', async () => {
    const req = makeAuthedReq({ method: 'POST', body: { joinable: true } });
    const res = makeRes();
    await toggleJoinableHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(store.teams.find((t: any) => t.id === TEAM_A)?.is_joinable).toBe(
      true
    );
  });
});
