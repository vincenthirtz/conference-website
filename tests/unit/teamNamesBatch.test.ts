// Lecture groupée des noms d'équipes — le hook `hooks/useTeamNames`.
//
// Avant : un `GET /api/teams/:id` par équipe (N+1 côté client). Désormais une
// requête `GET /api/teams?ids=a,b,c`, testée côté API (conference-api,
// tests/unit/teamNamesBatch.routes.test.ts). Ici, la fonction de chargement
// contre une RÉPONSE EN FIXTURE (pas de jsdom) : une requête pour N noms, URL
// triée, cache module respecté, requêtes en vol partagées, identifiants
// invalides non envoyés, découpage sous la borne serveur.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  __resetTeamNamesCacheForTests,
  buildTeamNamesUrl,
  loadTeamNames,
  TEAM_NAMES_BATCH_SIZE,
} from '../../hooks/useTeamNames';

/**
 * `MAX_TEAM_IDS` de `pages/api/teams/index.ts` (conference-api), gelé là-bas
 * par le même littéral. Le serveur refuse TOUT le lot au-delà : le hook doit
 * découper en dessous.
 */
const SERVER_MAX_TEAM_IDS = 50;

const ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ID_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function uuid(n: number): string {
  return `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
}

beforeEach(() => {
  __resetTeamNamesCacheForTests();
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
    expect(TEAM_NAMES_BATCH_SIZE).toBeLessThanOrEqual(SERVER_MAX_TEAM_IDS);
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
