// tests/unit/gamesFromVeto.test.ts
//
// Génération des parties depuis un veto terminé (utils/matches/gamesFromVeto.ts).
//
// Contexte : la logique existait en deux exemplaires (endpoint admin et
// endpoint bot), aucun idempotent, et le reset supprimait les parties même
// quand elles portaient des scores. `games` n'ayant aucune contrainte
// d'unicité, rien n'empêchait les doublons.

import { describe, it, expect } from 'vitest';
import {
  pickedMapsFromSteps,
  buildGamesPayload,
  hasRecordedScore,
  syncGamesFromVeto,
  clearGamesFromVeto,
} from '@/utils/matches/gamesFromVeto';

const steps = [
  { action: 'ban', map_name: 'Busan', step_number: 1 },
  { action: 'ban', map_name: 'Ilios', step_number: 2 },
  { action: 'pick', map_name: "King's Row", step_number: 3 },
  { action: 'pick', map_name: 'Numbani', step_number: 4 },
  { action: 'decider', map_name: 'Nepal', step_number: 5 },
];

describe('pickedMapsFromSteps', () => {
  it('ne retient que les picks et le decider', () => {
    expect(pickedMapsFromSteps(steps).map((s) => s.map_name)).toEqual([
      "King's Row",
      'Numbani',
      'Nepal',
    ]);
  });

  it('respecte l’ordre du veto même si les steps arrivent mélangés', () => {
    const shuffled = [steps[4], steps[2], steps[0], steps[3]];
    expect(pickedMapsFromSteps(shuffled).map((s) => s.map_name)).toEqual([
      "King's Row",
      'Numbani',
      'Nepal',
    ]);
  });

  it('ne mute pas le tableau reçu', () => {
    const input = [steps[4], steps[2]];
    pickedMapsFromSteps(input);
    expect(input[0].map_name).toBe('Nepal');
  });

  it('rend une liste vide quand il n’y a que des bans', () => {
    expect(pickedMapsFromSteps([steps[0], steps[1]])).toEqual([]);
  });
});

describe('buildGamesPayload', () => {
  it('numérote les cartes et marque la carte d’appoint', () => {
    const payload = buildGamesPayload(steps, 't1', 'm1');
    expect(payload.map((g) => [g.map_order, g.map_name, g.is_tiebreaker])).toEqual([
      [0, "King's Row", false],
      [1, 'Numbani', false],
      [2, 'Nepal', true],
    ]);
  });

  it('prépare des parties vides, pas des résultats', () => {
    for (const g of buildGamesPayload(steps, 't1', 'm1')) {
      expect(g.team1_score).toBe(0);
      expect(g.team2_score).toBe(0);
      expect(g.tenant_id).toBe('t1');
      expect(g.match_id).toBe('m1');
    }
  });
});

describe('hasRecordedScore', () => {
  it('un 0-0 est une ligne préparée, pas un résultat', () => {
    expect(hasRecordedScore({ id: 'g', team1_score: 0, team2_score: 0 })).toBe(false);
    expect(hasRecordedScore({ id: 'g', team1_score: null, team2_score: null })).toBe(false);
  });

  it('tout score non nul, des deux côtés, compte', () => {
    expect(hasRecordedScore({ id: 'g', team1_score: 1, team2_score: 0 })).toBe(true);
    expect(hasRecordedScore({ id: 'g', team1_score: 0, team2_score: 2 })).toBe(true);
  });
});

// --- Client simulé ----------------------------------------------------------

function fakeClient(initial: unknown[], opts: { readError?: boolean } = {}) {
  const state = { rows: [...initial], inserted: [] as unknown[], deletes: 0 };
  const client = {
    state,
    from() {
      const builder: Record<string, unknown> = {};
      let mode: 'select' | 'delete' = 'select';
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.delete = () => {
        mode = 'delete';
        return builder;
      };
      builder.insert = (rows: unknown[]) => {
        state.inserted.push(...rows);
        return Promise.resolve({ error: null });
      };
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (mode === 'delete') {
          state.deletes++;
          state.rows = [];
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        return Promise.resolve(
          opts.readError
            ? { data: null, error: { message: 'boom' } }
            : { data: state.rows, error: null }
        ).then(resolve);
      };
      return builder;
    },
  };
  return client as unknown as Parameters<typeof syncGamesFromVeto>[0] & typeof client;
}

describe('syncGamesFromVeto', () => {
  it('crée les parties quand le match n’en a aucune', async () => {
    const client = fakeClient([]);
    const res = await syncGamesFromVeto(client, { tenantId: 't1', matchId: 'm1', steps });
    expect(res).toEqual({ created: true, count: 3 });
    expect(client.state.inserted).toHaveLength(3);
    expect(client.state.deletes).toBe(0);
  });

  it('est idempotent : rejouer remplace au lieu d’empiler', async () => {
    // `games` n'a aucune contrainte d'unicité : sans ce remplacement, un veto
    // rejoué doublerait silencieusement les parties du match.
    const client = fakeClient([
      { id: 'g1', team1_score: 0, team2_score: 0 },
      { id: 'g2', team1_score: 0, team2_score: 0 },
    ]);
    const res = await syncGamesFromVeto(client, { tenantId: 't1', matchId: 'm1', steps });
    expect(res).toEqual({ created: true, count: 3 });
    expect(client.state.deletes).toBe(1);
    expect(client.state.inserted).toHaveLength(3);
  });

  it('ne touche à rien dès qu’une partie porte un score', async () => {
    const client = fakeClient([
      { id: 'g1', team1_score: 2, team2_score: 1 },
      { id: 'g2', team1_score: 0, team2_score: 0 },
    ]);
    const res = await syncGamesFromVeto(client, { tenantId: 't1', matchId: 'm1', steps });
    expect(res).toEqual({ created: false, reason: 'scores-existants' });
    expect(client.state.deletes).toBe(0);
    expect(client.state.inserted).toHaveLength(0);
  });

  it('sans carte retenue, ne fait rien', async () => {
    const client = fakeClient([]);
    const res = await syncGamesFromVeto(client, {
      tenantId: 't1',
      matchId: 'm1',
      steps: [{ action: 'ban', map_name: 'Busan', step_number: 1 }],
    });
    expect(res).toEqual({ created: false, reason: 'aucune-carte' });
    expect(client.state.inserted).toHaveLength(0);
  });

  it('une lecture en erreur n’efface rien', async () => {
    const client = fakeClient([], { readError: true });
    const res = await syncGamesFromVeto(client, { tenantId: 't1', matchId: 'm1', steps });
    expect(res).toEqual({ created: false, reason: 'erreur' });
    expect(client.state.deletes).toBe(0);
  });
});

describe('clearGamesFromVeto', () => {
  it('supprime les parties préparées', async () => {
    const client = fakeClient([
      { id: 'g1', team1_score: 0, team2_score: 0 },
      { id: 'g2', team1_score: 0, team2_score: 0 },
    ]);
    expect(await clearGamesFromVeto(client, { tenantId: 't1', matchId: 'm1' })).toEqual({
      cleared: 2,
    });
  });

  it('refuse d’effacer des scores saisis', async () => {
    // Le reset du veto supprimait jusqu'ici TOUTES les parties du match : une
    // perte de résultats à un clic.
    const client = fakeClient([{ id: 'g1', team1_score: 3, team2_score: 2 }]);
    expect(await clearGamesFromVeto(client, { tenantId: 't1', matchId: 'm1' })).toEqual({
      cleared: null,
      reason: 'scores-existants',
    });
    expect(client.state.deletes).toBe(0);
  });

  it('sans partie, ne fait rien et ne se plaint pas', async () => {
    const client = fakeClient([]);
    expect(await clearGamesFromVeto(client, { tenantId: 't1', matchId: 'm1' })).toEqual({
      cleared: 0,
    });
  });
});
