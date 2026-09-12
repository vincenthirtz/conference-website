// Tests de GET /api/player/discovery/profile — la couche sociale du profil
// public (lot 1 de docs/BACKLOG-reseau-social.md).
//
// L'invariant central n'est pas « ça répond », c'est que la route NE SOIT PAS
// UN ORACLE : joueuse non découvrable, compte inexistant et id malformé
// doivent être indiscernables de l'extérieur. Un 404 sur l'un et un 200 sur
// l'autre suffiraient à énumérer les comptes du réseau.
//
// supabase + rateLimit sont mockés par tests/unit/__helpers__/testSetup.ts.
// Un Bearer neuf par appel déjoue le cache token→user de 60 s (utils/staff.ts).

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import profileHandler from '@/pages/api/player/discovery/profile';

const ME = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function discoverable(authUserId: string, over: Record<string, unknown> = {}) {
  return {
    auth_user_id: authUserId,
    discoverable: true,
    display_name: null,
    avatar_url: null,
    tagline: null,
    show_ratings: true,
    show_teams: true,
    updated_at: '2026-09-12T10:00:00.000Z',
    ...over,
  };
}

async function get(userId: string) {
  const res = makeRes();
  await profileHandler(makeReq({ query: { userId } }), res);
  return res;
}

describe('GET /api/player/discovery/profile', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: ME });
  });

  it('répond découvrable, avec le compteur d’abonnées', async () => {
    store.player_discovery_profiles = [discoverable(A)];
    store.player_follows = [
      { follower_id: B, followee_id: A },
      { follower_id: ME, followee_id: A },
    ];

    const res = await get(A);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      discoverable: true,
      isFollowing: true,
      followerCount: 2,
    });
  });

  it('dit « pas découvrable » quand l’opt-in est coupé', async () => {
    store.player_discovery_profiles = [
      discoverable(A, { discoverable: false }),
    ];

    const res = await get(A);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ discoverable: false });
  });

  it('répond EXACTEMENT pareil pour un compte inexistant — pas d’oracle', async () => {
    store.player_discovery_profiles = [];

    const inconnu = await get(A);
    const optOut = await (async () => {
      store.player_discovery_profiles = [
        discoverable(B, { discoverable: false }),
      ];
      return get(B);
    })();

    expect(inconnu.statusCode).toBe(optOut.statusCode);
    expect(inconnu.body).toEqual(optOut.body);
    expect(inconnu.body).toEqual({ discoverable: false });
  });

  it('ne signale pas un id malformé autrement qu’en se taisant', async () => {
    const res = await get('pas-un-uuid');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ discoverable: false });
  });

  it('ne renvoie jamais isFollowing=true pour une arête d’une autre personne', async () => {
    store.player_discovery_profiles = [discoverable(A)];
    store.player_follows = [{ follower_id: B, followee_id: A }];

    const res = await get(A);

    expect(res.body).toMatchObject({ isFollowing: false, followerCount: 1 });
  });

  it('refuse les autres méthodes', async () => {
    const res = makeRes();
    await profileHandler(
      makeReq({ method: 'POST', query: { userId: A } }),
      res
    );

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('ne met jamais la réponse en cache', async () => {
    store.player_discovery_profiles = [discoverable(A)];

    const res = await get(A);

    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
