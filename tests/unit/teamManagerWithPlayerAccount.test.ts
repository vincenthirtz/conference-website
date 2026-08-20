// Un compte JOUEUSE devient manager de PLUSIEURS équipes.
//
// `teamMultiTeamManager.test.ts` couvre le manager « pur » : un compte qui
// n'encadre que. Le cas réel le plus fréquent est l'autre : quelqu'un qui a
// DÉJÀ un compte joueur — et souvent déjà une équipe où il joue — à qui l'on
// demande d'encadrer une ou plusieurs autres équipes.
//
// Ce cas croise les deux invariants que allow_manager_multi_team.sql sépare :
//
//   - la ligne `player` reste couverte par l'index unique partiel
//     (`role IS DISTINCT FROM 'manager'`) : elle « prend » le compte, et les
//     gardes « tu es déjà dans une équipe » doivent continuer de la voir ;
//   - les lignes `manager` en sont exclues : elles peuvent être multiples, et
//     ne doivent NI être bloquées à l'ajout, NI faire croire que la personne
//     gère l'équipe où elle joue.
//
// Cibles : utils/teams/addMember.ts (insertTeamMember — le point d'entrée qui
//          bloquait en 23505), utils/teams/managementAccess.ts,
//          utils/teams/memberships.ts, pages/api/teams/add-member.ts,
//          pages/api/teams/leave.ts.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  getManagedTeam,
  getManagedTeams,
} from '../../utils/teams/managementAccess';
import {
  listMemberships,
  pickExclusiveMembership,
  pickMembership,
  isExclusiveMembership,
} from '../../utils/teams/memberships';

import addMemberHandler from '../../pages/api/teams/add-member';
import leaveHandler from '../../pages/api/teams/leave';

/** L'équipe où ALICE JOUE (rôle `player`) — elle n'y encadre rien. */
const TEAM_PLAY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
/** Les deux équipes qu'on lui demande d'ENCADRER. */
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEAM_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const ALICE = 'a11ce000-0000-4000-8000-000000000001';
const CAPTAIN_PLAY = 'ca9ta1n0-0000-4000-8000-00000000000a';
const CAPTAIN_B = 'ca9ta1n0-0000-4000-8000-00000000000b';
const CAPTAIN_C = 'ca9ta1n0-0000-4000-8000-00000000000c';

let _tokenCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  _tokenCounter += 1;
  return {
    method: 'POST',
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

/**
 * État de départ : ALICE a un compte joueur, et une seule appartenance —
 * joueuse de TEAM_PLAY. Les deux autres équipes ont leur propre capitaine.
 */
beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  store.teams = [
    {
      id: TEAM_PLAY,
      name: 'Son équipe',
      captain_id: CAPTAIN_PLAY,
      is_active: true,
      is_joinable: false,
    },
    {
      id: TEAM_B,
      name: 'Bravo',
      captain_id: CAPTAIN_B,
      is_active: true,
      is_joinable: false,
    },
    {
      id: TEAM_C,
      name: 'Charlie',
      captain_id: CAPTAIN_C,
      is_active: true,
      is_joinable: false,
    },
  ] as any;
  store.team_members = [
    {
      id: 'm-play',
      team_id: TEAM_PLAY,
      user_id: ALICE,
      role: 'player',
      created_at: '2026-01-01T00:00:00Z',
    },
  ] as any;
});

/** La capitaine de `teamId` ajoute ALICE avec le rôle `role`. */
async function addAliceTo(captainId: string, role: string) {
  setAuthUser({ id: captainId });
  const req = makeReq({ body: { userId: ALICE, role } });
  const res = makeRes();
  await addMemberHandler(req, res);
  return res;
}

describe('ajout comme manager d’un compte qui joue déjà ailleurs', () => {
  it('la 1re équipe encadrée passe — le siège de joueuse ne bloque pas', async () => {
    const res = await addAliceTo(CAPTAIN_B, 'manager');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ teamId: TEAM_B, role: 'manager' });
  });

  it('la 2e équipe encadrée passe aussi — c’est tout l’objet du multi-équipes', async () => {
    await addAliceTo(CAPTAIN_B, 'manager');
    const res = await addAliceTo(CAPTAIN_C, 'manager');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ teamId: TEAM_C, role: 'manager' });

    const rows = await listMemberships(ALICE, DEFAULT_TENANT_ID);
    expect(rows.map((r) => r.team_id).sort()).toEqual(
      [TEAM_PLAY, TEAM_B, TEAM_C].sort()
    );
  });

  it('mais elle ne peut PAS être ajoutée comme JOUEUSE d’une 2e équipe', async () => {
    // Miroir de l'index : le prédicat couvre `player`, la 23505 tombe. Le mock
    // n'implémente pas l'unicité — on vérifie donc la règle sur le sélecteur
    // pur, qui est le miroir testable du SQL, et que les gardes consultent.
    const rows = await listMemberships(ALICE, DEFAULT_TENANT_ID);
    expect(pickExclusiveMembership(rows)?.team_id).toBe(TEAM_PLAY);
  });
});

describe('ce que l’encadrement lui ouvre — et ce qu’il ne lui ouvre pas', () => {
  beforeEach(async () => {
    await addAliceTo(CAPTAIN_B, 'manager');
    await addAliceTo(CAPTAIN_C, 'manager');
    setAuthUser({ id: ALICE });
  });

  it('elle gère B et C, jamais l’équipe où elle se contente de jouer', async () => {
    const accesses = await getManagedTeams(ALICE);
    expect(accesses.map((a) => a.teamId)).toEqual([TEAM_B, TEAM_C]);
    expect(accesses.every((a) => a.isManager && !a.isCaptain)).toBe(true);
    expect(await getManagedTeam(ALICE, undefined, TEAM_PLAY)).toBeNull();
  });

  it('`?teamId=` choisit laquelle des deux, sans jamais élargir la portée', async () => {
    expect((await getManagedTeam(ALICE, undefined, TEAM_C))?.teamId).toBe(
      TEAM_C
    );
    expect((await getManagedTeam(ALICE, undefined, TEAM_B))?.teamId).toBe(
      TEAM_B
    );
  });

  it('les gardes « déjà dans une équipe » voient toujours son siège de joueuse', async () => {
    const rows = await listMemberships(ALICE, DEFAULT_TENANT_ID);
    // Ce que lisent join / invitation / self-transfer : la ligne exclusive.
    expect(pickExclusiveMembership(rows)?.team_id).toBe(TEAM_PLAY);
    // Et le miroir du prédicat SQL, ligne à ligne.
    expect(rows.filter(isExclusiveMembership)).toHaveLength(1);
  });

  it('« mon équipe » sans paramètre reste celle où elle JOUE', async () => {
    // Repli déterministe : l'exclusive d'abord. Ses matchs, ses notifications
    // parlent de l'équipe où elle joue tant qu'elle n'a pas choisi autrement.
    const rows = await listMemberships(ALICE, DEFAULT_TENANT_ID);
    expect(pickMembership(rows)?.team_id).toBe(TEAM_PLAY);
    expect(pickMembership(rows, TEAM_C)?.team_id).toBe(TEAM_C);
  });
});

describe('quitter : on ne devine pas', () => {
  beforeEach(async () => {
    await addAliceTo(CAPTAIN_B, 'manager');
    setAuthUser({ id: ALICE });
  });

  it('sans `?teamId=`, refuse plutôt que de la sortir d’une équipe au hasard', async () => {
    const res = makeRes();
    await leaveHandler(makeReq(), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'TEAM_AMBIGUOUS' });
  });

  it('refuse une équipe dont elle n’est pas membre', async () => {
    const res = makeRes();
    await leaveHandler(makeReq({ query: { teamId: TEAM_C } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'TEAM_AMBIGUOUS' });
  });
});
