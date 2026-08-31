// Le SR d'ensemble d'une équipe, côté staff (PATCH /api/admin/teams/[teamId]).
//
// Deux chemins écrivent cette colonne — la capitaine ou une manager via
// /api/admin/teams/my, le staff ici — et ils doivent appliquer le MÊME contrat :
// `null` ou chaîne vide effacent, l'absence de clé ne touche à rien, une valeur
// hors bornes est refusée sans rien écrire. Deux chemins, deux politiques, c'est
// ce qui a produit les incohérences de BattleTag.
//
// Le piège propre à cette route : sa boucle d'allowlist recopie `body[key]` TEL
// QUEL dans le payload. Un « 3500 » venu d'un champ de formulaire partirait donc
// en base sous forme de CHAÎNE. Le test qui compte est celui qui vérifie qu'un
// nombre en ressort.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, status: 200 })),
}));

import handler from '../../pages/api/admin/teams/[teamId]';

const TEAM = '550e8400-e29b-41d4-a716-4466554400a1';

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
function makeReq(body: Record<string, unknown>): any {
  _t += 1;
  return {
    method: 'PATCH',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    query: { teamId: TEAM },
    body,
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

const team = () => (store.teams as any[]).find((t) => t.id === TEAM);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.teams = [
    {
      id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      slug: 'alpha',
      is_active: true,
      deleted_at: null,
      skill_rating: 3000,
    },
  ] as any;
});

describe('PATCH /api/admin/teams/[teamId] — SR d’ensemble', () => {
  it('le staff pose un niveau d’équipe', async () => {
    const res = makeRes();
    await handler(makeReq({ skill_rating: 3500 }), res);
    expect(res.statusCode).toBe(200);
    expect(team().skill_rating).toBe(3500);
  });

  // LE test : l'allowlist recopie la valeur brute, donc une chaîne non coercée
  // atterrirait telle quelle dans une colonne integer.
  it('écrit un NOMBRE même quand le formulaire envoie une chaîne', async () => {
    const res = makeRes();
    await handler(makeReq({ skill_rating: '2750' }), res);
    expect(res.statusCode).toBe(200);
    expect(team().skill_rating).toBe(2750);
    expect(typeof team().skill_rating).toBe('number');
  });

  it('efface sur null comme sur chaîne vide', async () => {
    for (const vide of [null, '']) {
      store.teams = [{ ...team(), skill_rating: 3000 }] as any;
      const res = makeRes();
      await handler(makeReq({ skill_rating: vide }), res);
      expect(res.statusCode).toBe(200);
      expect(team().skill_rating).toBeNull();
    }
  });

  it('refuse hors bornes et non entier, sans rien écrire', async () => {
    for (const mauvais of [5001, -1, 3500.5, 'beaucoup']) {
      const res = makeRes();
      await handler(makeReq({ skill_rating: mauvais }), res);
      expect(res.statusCode).toBe(400);
      expect(team().skill_rating).toBe(3000);
    }
  });

  it('l’absence de clé ne touche pas à la déclaration', async () => {
    const res = makeRes();
    await handler(makeReq({ country: 'FR' }), res);
    expect(res.statusCode).toBe(200);
    expect(team().skill_rating).toBe(3000);
  });
});
