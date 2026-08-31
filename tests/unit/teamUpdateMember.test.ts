// Unit tests for pages/api/teams/update-member.ts
//
// The captain/manager self-service endpoint that updates a single roster
// member's BattleTag and/or substitute flag (and optionally role). Mirrors the
// teamManagerRole harness.
//
// Coverage:
//   - inline BattleTag edit (valid + invalid format)
//   - substitute toggle (mark / unmark)
//   - access control (plain player -> 403, member of another team -> 404)
//   - niveau Overwatch declare (skill_rating) : pose, correction, effacement
//   - audit logs emitted: update_player_battle_tag, manage_substitute,
//     update_player_skill_rating

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import updateMemberHandler from '../../pages/api/teams/update-member';

vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster locked',
}));

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'PATCH',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TEAM_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TM_CAP = '11111111-1111-1111-1111-111111111111';
const TM_PLY = '33333333-3333-3333-3333-333333333333';
const TM_OTHER = '55555555-5555-5555-5555-555555555555';
const MANAGER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TM_MGR = '66666666-6666-6666-6666-666666666666';

function seed() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
    {
      id: OTHER_TEAM_ID,
      name: 'Bravo',
      captain_id: 'someone-else',
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      id: TM_CAP,
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'player',
      battle_tag: 'Cap#1111',
      is_substitute: false,
    },
    {
      id: TM_PLY,
      team_id: TEAM_ID,
      user_id: PLAYER_ID,
      role: 'player',
      battle_tag: 'Old#1234',
      skill_rating: 3000,
      is_substitute: false,
    },
    {
      id: TM_OTHER,
      team_id: OTHER_TEAM_ID,
      user_id: 'other-player',
      role: 'player',
      battle_tag: 'Other#9999',
      is_substitute: false,
    },
    // Une manager de l'équipe : le rôle `manager` porte TOUTES les permissions
    // d'équipe par défaut (cf. DEFAULT_TEAM_ROLES), dont `manage_roster`.
    {
      id: TM_MGR,
      team_id: TEAM_ID,
      user_id: MANAGER_ID,
      role: 'manager',
      battle_tag: null,
      is_substitute: false,
    },
  ] as any;
  // staff row so getStaffByUserId resolves a staff_id for audit logs.
  store.staff = [
    {
      id: 'staff-cap',
      auth_user_id: CAPTAIN_ID,
      role: 'caster',
      display_name: 'Cap',
      is_active: true,
    },
  ] as any;
  store.staff_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN_ID });
  seed();
});

describe('/api/teams/update-member - BattleTag', () => {
  it('captain can fix a member BattleTag', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'New#4242' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.battle_tag).toBe('New#4242');
  });

  it('rejects an invalid BattleTag format', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'not-a-tag' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.battle_tag).toBe('Old#1234');
  });

  it('emits update_player_battle_tag audit log on change', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'New#4242' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'update_player_battle_tag'
    );
    expect(log).toBeTruthy();
    expect(log.entity_id).toBe(TM_PLY);
  });
});

/* ---------------------------------------------------------------------------
 * MANAGER
 *
 * Tenir le roster est le métier du manager, pas une faveur : il corrige les
 * attributs d'une fiche comme la capitaine. Seule la HIÉRARCHIE lui reste
 * fermée — dégrader un pair privilégié est un conflit, pas une délégation, et
 * c'est déjà couvert par teamManagerRole.test.ts.
 *
 * Ces cas existaient en pratique mais rien ne les verrouillait : le champ
 * BattleTag de l'écran d'équipe s'appuie dessus.
 * ------------------------------------------------------------------------- */

describe('/api/teams/update-member as manager', () => {
  it('une manager corrige le BattleTag d’une joueuse', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'Fix#4242' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.battle_tag).toBe('Fix#4242');
  });

  it('une manager pose le niveau d’une joueuse', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, skill_rating: 3200 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.skill_rating).toBe(3200);
  });

  it('une manager corrige aussi la fiche de la CAPITAINE', async () => {
    // Le garde-fou de hiérarchie porte sur le rôle, pas sur les attributs :
    // interdire ça obligerait à repasser par le staff pour une coquille.
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_CAP, battle_tag: 'Cap#2222' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_CAP);
    expect(member.battle_tag).toBe('Cap#2222');
  });

  it('la règle de format vaut aussi pour elle', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'pas-un-tag' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.battle_tag).toBe('Old#1234');
  });
});

describe('/api/teams/update-member - skill_rating', () => {
  it('la capitaine pose un niveau', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, skill_rating: 3500 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.skill_rating).toBe(3500);
  });

  // Le formulaire envoie une chaine : la refuser obligerait chaque appelant a
  // convertir, et un `Number()` oublie quelque part poserait un NaN en base.
  it('accepte une valeur envoyée sous forme de chaîne', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, skill_rating: '2750' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.skill_rating).toBe(2750);
  });

  // Vider est une intention, pas une absence : `null` efface, et l'absence de
  // cle ne touche a rien (couvert par « rejects when no field is provided »).
  it('efface le niveau sur null', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, skill_rating: null } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.skill_rating).toBeNull();
  });

  it('efface le niveau sur chaîne vide', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, skill_rating: '' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.skill_rating).toBeNull();
  });

  it('refuse hors bornes et non entier, sans rien écrire', async () => {
    for (const bad of [5001, -1, 3500.5, 'beaucoup']) {
      const res = makeRes();
      await updateMemberHandler(
        makeAuthedReq({ body: { memberId: TM_PLY, skill_rating: bad } }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect((res.body as any).code).toBe('SKILL_RATING_INVALID');
      const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
      expect(member.skill_rating).toBe(3000);
    }
  });

  it('journalise update_player_skill_rating avec l’avant et l’après', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, skill_rating: 4200 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'update_player_skill_rating'
    );
    expect(log).toBeTruthy();
    expect(log.entity_id).toBe(TM_PLY);
    expect(log.payload.previous).toBe(3000);
    expect(log.payload.next).toBe(4200);
  });

  it('ne journalise rien quand la valeur ne change pas', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, skill_rating: 3000 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.staff_logs as any[]).find(
        (l) => l.action === 'update_player_skill_rating'
      )
    ).toBeFalsy();
  });

  it('un membre simple ne peut pas noter le roster (403)', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_CAP, skill_rating: 1000 } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('/api/teams/update-member - substitute', () => {
  it('captain can mark a member as substitute', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, is_substitute: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.is_substitute).toBe(true);
  });

  it('captain can unmark a substitute', async () => {
    // État de départ COHÉRENT : `role='substitute'` ET le drapeau. La fixture
    // ne posait que le drapeau — exactement la contradiction que la contrainte
    // `chk_team_members_substitute_matches_role` interdit désormais en base.
    const target = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    target.role = 'substitute';
    target.is_substitute = true;

    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, is_substitute: false } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.is_substitute).toBe(false);
    // Démarquer, c'est REVENIR au rôle joueuse — pas laisser un
    // `role='substitute'` orphelin derrière soi.
    expect(member.role).toBe('player');
  });

  it('marquer remplaçante change le RÔLE, pas seulement le drapeau', async () => {
    // « Remplaçante » était écrit deux fois sur la même ligne (role +
    // is_substitute) sans que rien ne les lie. Les lecteurs ne tranchaient pas
    // pareil : splitTeamMembers classe sur le drapeau, countPlayingMembers et
    // le quota `enforce_team_max_players` raisonnent sur le rôle. Une même
    // personne pouvait donc être affichée sur le banc et comptée titulaire.
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, is_substitute: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member).toMatchObject({ role: 'substitute', is_substitute: true });
  });

  it('refuse un payload qui se contredit', async () => {
    // `role: 'player'` + `is_substitute: true` : deviner lequel gagne, c'est
    // rendre le résultat dépendant de l'ordre du code. On refuse.
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({
        body: { memberId: TM_PLY, role: 'player', is_substitute: true },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/contredisent/i);
  });

  it('refuse de mettre un rôle d’encadrement sur le banc', async () => {
    // Un coach n'est pas « remplaçant » : il n'est pas dans le roster jouant
    // du tout. Le marquer laisserait une ligne que countPlayingMembers ignore
    // mais que l'affichage rangerait avec les remplaçantes.
    const target = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    target.role = 'coach';
    target.is_substitute = false;

    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, is_substitute: true } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/encadrement/i);
  });

  it('emits manage_substitute audit log on change', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, is_substitute: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'manage_substitute'
    );
    expect(log).toBeTruthy();
    expect(log.payload?.is_substitute).toBe(true);
  });
});

describe('/api/teams/update-member - access control', () => {
  it('plain player (no managed team) gets 403', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'New#4242' } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('cannot edit a member of another team (404)', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_OTHER, battle_tag: 'New#4242' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('rejects when no field is provided', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});
