// Unit tests — lecture groupée des noms d'équipes.
//
// Avant : `hooks/useTeamNames` faisait un `GET /api/teams/:id` par équipe
// (N+1 côté client). Désormais `GET /api/teams?ids=a,b,c`.
//
// Couvert :
//   - route : filtre par identifiants dans l'espace, validation (UUID, borne,
//     vide), 400 avant toute lecture ;
//   - hook (fonction de chargement, pas de jsdom ici) : une requête pour N noms,
//     URL triée, cache module respecté, requêtes en vol partagées, identifiants
//     invalides non envoyés.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  fromCalls,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import teamsHandler, {
  MAX_TEAM_IDS,
  parseIdsParam,
} from '../../pages/api/teams/index';
import {
  __resetTeamNamesCacheForTests,
  buildTeamNamesUrl,
  loadTeamNames,
  TEAM_NAMES_BATCH_SIZE,
} from '../../hooks/useTeamNames';

const ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ID_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function uuid(n: number): string {
  return `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
}

function makeReq(query: Record<string, unknown>): any {
  return { method: 'GET', headers: { host: 'example.com' }, query };
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

beforeEach(() => {
  resetSupabaseMock();
  __resetTeamNamesCacheForTests();
});

describe('GET /api/teams?ids=', () => {
  beforeEach(() => {
    store.teams = [
      {
        id: ID_A,
        name: 'Alpha',
        tenant_id: CONFERENCE_TENANT_ID,
        team_members: [],
      },
      {
        id: ID_B,
        name: 'Bravo',
        tenant_id: CONFERENCE_TENANT_ID,
        team_members: [],
      },
      // Même identifiant demandé, autre espace : ne doit pas sortir.
      {
        id: ID_C,
        name: 'Charlie',
        tenant_id: 'other-tenant',
        team_members: [],
      },
    ] as any;
  });

  it("ne renvoie que les équipes demandées, dans l'espace", async () => {
    const res = makeRes();
    await teamsHandler(makeReq({ ids: `${ID_C},${ID_A}` }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).teams.map((t: any) => t.name)).toEqual(['Alpha']);
  });

  it('sans ids, la liste reste inchangée', async () => {
    const res = makeRes();
    await teamsHandler(makeReq({}), res);
    expect((res.body as any).teams.map((t: any) => t.id)).toEqual([ID_A, ID_B]);
  });

  it.each([
    ['non UUID', `${ID_A},pas-un-uuid`],
    ['vide', ' , '],
    [
      'trop long',
      Array.from({ length: MAX_TEAM_IDS + 1 }, (_, i) => uuid(i)).join(','),
    ],
  ])('refuse un lot %s (400) sans lire la base', async (_label, ids) => {
    const res = makeRes();
    await teamsHandler(makeReq({ ids }), res);
    expect(res.statusCode).toBe(400);
    expect(fromCalls).not.toContain('teams');
  });

  it('parseIdsParam : déduplique et accepte la forme répétée', () => {
    expect(parseIdsParam([ID_A, `${ID_B},${ID_A.toUpperCase()}`])).toEqual([
      ID_A,
      ID_B,
    ]);
    expect(parseIdsParam(undefined)).toBeNull();
  });
});

describe('useTeamNames — chargement groupé', () => {
  function okResponse(teams: Array<{ id: string; name: string }>) {
    return { ok: true, json: async () => ({ teams }) } as unknown as Response;
  }

  it('une seule requête pour N noms, identifiants triés dans URL', async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse([
        { id: ID_A, name: 'Alpha' },
        { id: ID_B, name: 'Bravo' },
        { id: ID_C, name: 'Charlie' },
      ])
    );
    await loadTeamNames([ID_C, ID_A, ID_B, ID_A], fetchImpl as any);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/teams?ids=${ID_A},${ID_B},${ID_C}`
    );
    expect(buildTeamNamesUrl([ID_B, ID_A])).toBe(
      buildTeamNamesUrl([ID_A, ID_B])
    );
  });

  it('respecte le cache : ne redemande que les absents, puis plus rien', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      okResponse(
        [
          { id: ID_A, name: 'Alpha' },
          { id: ID_B, name: 'Bravo' },
        ].filter((t) => url.includes(t.id))
      )
    );
    await loadTeamNames([ID_A], fetchImpl as any);
    await loadTeamNames([ID_A, ID_B], fetchImpl as any);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith(`/api/teams?ids=${ID_B}`);
    await loadTeamNames([ID_B, ID_A], fetchImpl as any);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('partage une requête en vol entre deux appels simultanés', async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse([{ id: ID_A, name: 'Alpha' }])
    );
    await Promise.all([
      loadTeamNames([ID_A], fetchImpl as any),
      loadTeamNames([ID_A], fetchImpl as any),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("n'envoie pas d'identifiant invalide (le serveur refuserait tout le lot)", async () => {
    const fetchImpl = vi.fn(async () => okResponse([]));
    await loadTeamNames(['not-a-uuid'], fetchImpl as any);
    expect(fetchImpl).not.toHaveBeenCalled();
    await loadTeamNames(['not-a-uuid', ID_A], fetchImpl as any);
    expect(fetchImpl).toHaveBeenCalledWith(`/api/teams?ids=${ID_A}`);
  });

  it('découpe au-delà de la taille de lot, sans dépasser la borne serveur', async () => {
    expect(TEAM_NAMES_BATCH_SIZE).toBeLessThanOrEqual(MAX_TEAM_IDS);
    const fetchImpl = vi.fn(async () => okResponse([]));
    const ids = Array.from({ length: TEAM_NAMES_BATCH_SIZE + 1 }, (_, i) =>
      uuid(i + 1)
    );
    await loadTeamNames(ids, fetchImpl as any);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('ne jette pas sur une erreur réseau', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(
      loadTeamNames([ID_A], fetchImpl as any)
    ).resolves.toBeUndefined();
  });
});
