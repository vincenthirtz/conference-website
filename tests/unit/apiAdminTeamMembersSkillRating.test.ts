// Le niveau Overwatch déclaré (SR) sur la route staff
// /api/admin/teams/[teamId]/members.
//
// Deux chemins d'écriture existent pour la même colonne — celui de la capitaine
// (/api/teams/update-member) et celui du staff, ici. Ce qui se teste en
// priorité, c'est qu'ils appliquent le MÊME contrat : `null` ou chaîne vide
// effacent, l'absence de clé ne touche à rien, une valeur hors bornes est
// refusée sans rien écrire. Deux chemins, deux politiques, c'est exactement ce
// qui a produit les incohérences de BattleTag.
//
// Et une règle propre au staff : poser un SR n'est PAS un mouvement d'effectif,
// donc le verrou de roster ne s'y oppose pas.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

const { isTeamRosterLocked } = vi.hoisted(() => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
}));
vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked,
  rosterLockErrorMessage: () => 'Roster verrouillé',
}));

import handler from '../../pages/api/admin/teams/[teamId]/members';

const TEAM = '550e8400-e29b-41d4-a716-446655440d01';
const MEMBER = '550e8400-e29b-41d4-a716-446655440d02';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _t = 0;
function makeReq(over: Partial<any> = {}): any {
  _t += 1;
  return {
    method: 'PATCH',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    query: { teamId: TEAM },
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const member = () =>
  (store.team_members as any[]).find((m) => m.id === MEMBER);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  isTeamRosterLocked.mockResolvedValue({ locked: false } as any);
  store.staff = [makeStaffRow()] as any;
  store.teams = [
    {
      id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.team_members = [
    {
      id: MEMBER,
      team_id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      user_id: 'joueuse-1',
      role: 'player',
      battle_tag: 'Tag#1234',
      skill_rating: 3000,
      is_substitute: false,
    },
  ] as any;
});

describe('PATCH — niveau déclaré', () => {
  it('le staff pose un niveau', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { memberId: MEMBER, skillRating: 3500 } }), res);
    expect(res.statusCode).toBe(200);
    expect(member().skill_rating).toBe(3500);
  });

  it('accepte la chaîne envoyée par le formulaire', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { memberId: MEMBER, skillRating: '2750' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(member().skill_rating).toBe(2750);
  });

  it('efface sur null comme sur chaîne vide', async () => {
    for (const vide of [null, '']) {
      store.team_members = [
        { ...(store.team_members as any[])[0], skill_rating: 3000 },
      ] as any;
      const res = makeRes();
      await handler(
        makeReq({ body: { memberId: MEMBER, skillRating: vide } }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect(member().skill_rating).toBeNull();
    }
  });

  it('refuse hors bornes sans rien écrire', async () => {
    for (const mauvais of [5001, -1, 3500.5, 'beaucoup']) {
      const res = makeRes();
      await handler(
        makeReq({ body: { memberId: MEMBER, skillRating: mauvais } }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(member().skill_rating).toBe(3000);
    }
  });

  it('l’absence de clé ne touche à rien', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { memberId: MEMBER, battleTag: 'Autre#4242' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(member().battle_tag).toBe('Autre#4242');
    expect(member().skill_rating).toBe(3000);
  });

  it('le verrou de roster ne bloque PAS un niveau', async () => {
    // Le verrou fige une COMPOSITION d'effectif. Corriger un SR de saison ne
    // déplace personne — même exception que la correction de BattleTag.
    isTeamRosterLocked.mockResolvedValue({ locked: true } as any);
    const res = makeRes();
    await handler(makeReq({ body: { memberId: MEMBER, skillRating: 4000 } }), res);
    expect(res.statusCode).toBe(200);
    expect(member().skill_rating).toBe(4000);
  });

  it('mais il bloque toujours un changement de rôle', async () => {
    isTeamRosterLocked.mockResolvedValue({ locked: true } as any);
    const res = makeRes();
    await handler(makeReq({ body: { memberId: MEMBER, role: 'coach' } }), res);
    expect(res.statusCode).toBe(409);
  });
});

describe('POST — niveau déclaré à l’ajout', () => {
  it('pose le niveau fourni', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: {
          userId: 'joueuse-2',
          role: 'player',
          battleTag: 'Neuve#1234',
          skillRating: '2500',
        },
      }),
      res
    );
    const added = (store.team_members as any[]).find(
      (m) => m.user_id === 'joueuse-2'
    );
    expect(added?.skill_rating).toBe(2500);
  });

  it('ignore une valeur aberrante plutôt que de refuser l’ajout', async () => {
    // L'objet de l'appel est d'ajouter la personne. Un SR mal saisi se corrige
    // ensuite sur la ligne de roster ; faire échouer l'ajout pour ça serait
    // disproportionné.
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: {
          userId: 'joueuse-3',
          role: 'player',
          battleTag: 'Neuve#5678',
          skillRating: 99999,
        },
      }),
      res
    );
    const added = (store.team_members as any[]).find(
      (m) => m.user_id === 'joueuse-3'
    );
    expect(added).toBeTruthy();
    expect(added?.skill_rating ?? null).toBeNull();
  });
});
