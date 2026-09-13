// tests/unit/playerHeroPreferences.test.ts
// GET / PUT /api/player/hero-preferences
//
// CE QUE CES CAS PROTÈGENT, et pourquoi c'est ici et pas dans la base.
//
// Le schéma borne à trois et interdit qu'un héros soit préféré ET banni. Il ne
// peut PAS garantir l'unicité intra-liste (Postgres refuse toute sous-requête
// dans un CHECK) ni l'existence d'un héros — ces deux règles ne tiennent que
// par cette route. Si elles tombaient, rien en base ne les rattraperait : ces
// tests sont donc le seul garde-fou de ces deux invariants.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { HERO_PREFERENCE_SLOTS } from '../../utils/heroes/overwatch';

import handler from '../../pages/api/player/hero-preferences';

const PLAYER = '11111111-1111-4111-8111-111111111111';

let _token = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: {},
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

const rows = () => (store.player_hero_preferences ?? []) as any[];

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: PLAYER });
});

describe('GET /api/player/hero-preferences', () => {
  it('rend des listes vides plutôt qu’une erreur quand rien n’est choisi', async () => {
    // N'avoir rien choisi est l'état normal de la majorité.
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.picks).toEqual([]);
    expect(res.body.bans).toEqual([]);
  });

  it('rend le nombre d’emplacements, pour que l’interface ne le recopie pas', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.body.slots).toBe(HERO_PREFERENCE_SLOTS);
  });
});

describe('PUT /api/player/hero-preferences', () => {
  it('enregistre picks et bans', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        body: { picks: ['Ana', 'Kiriko'], bans: ['Genji'] },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].picks).toEqual(['Ana', 'Kiriko']);
    expect(rows()[0].bans).toEqual(['Genji']);
  });

  it('conserve l’ORDRE des picks — c’est la préférence de la joueuse', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'PUT', body: { picks: ['Zenyatta', 'Ana', 'Mercy'] } }),
      res
    );
    expect(res.body.picks).toEqual(['Zenyatta', 'Ana', 'Mercy']);
  });

  it('refuse un héros qui n’existe pas', async () => {
    // La base ne peut pas le vérifier : cette route est le seul garde-fou.
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: { picks: ['Batman'] } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(rows()).toHaveLength(0);
  });

  it('refuse un doublon dans une liste', async () => {
    // Idem : impossible à exprimer dans un CHECK sans sous-requête.
    const res = makeRes();
    await handler(
      makeReq({ method: 'PUT', body: { picks: ['Ana', 'Ana'] } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('refuse plus d’emplacements que permis', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        body: { picks: ['Ana', 'Kiriko', 'Mercy', 'Moira'] },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('refuse un héros à la fois préféré ET banni', async () => {
    // Contradiction que la base interdit aussi — mais un 400 explicite dit à la
    // joueuse CE qui ne va pas, là où un 500 de contrainte ne dirait rien.
    const res = makeRes();
    await handler(
      makeReq({ method: 'PUT', body: { picks: ['Ana'], bans: ['Ana'] } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('remplace les listes au lieu de les cumuler', async () => {
    await handler(
      makeReq({ method: 'PUT', body: { picks: ['Ana', 'Kiriko'] } }),
      makeRes()
    );
    const res = makeRes();
    await handler(makeReq({ method: 'PUT', body: { picks: ['Mercy'] } }), res);

    // Un cumul laisserait trois picks : le PUT porte l'état COMPLET.
    expect(res.body.picks).toEqual(['Mercy']);
    expect(rows()).toHaveLength(1);
  });

  it('accepte de tout effacer', async () => {
    await handler(
      makeReq({ method: 'PUT', body: { picks: ['Ana'], bans: ['Genji'] } }),
      makeRes()
    );
    const res = makeRes();
    await handler(
      makeReq({ method: 'PUT', body: { picks: [], bans: [] } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.picks).toEqual([]);
    expect(res.body.bans).toEqual([]);
  });

  it('refuse une méthode non autorisée', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET,PUT');
  });
});
