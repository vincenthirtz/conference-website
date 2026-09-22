// Unit tests — agrégats du simulateur (utils/simulatorStats.ts).
//
// Le calcul vivait dans un `useMemo` de `pages/admin/tournament-simulator.tsx`,
// donc sans aucun test. Sorti en fonction pure (lot 3), il se vérifie enfin.

import { describe, it, expect } from 'vitest';
import { computeSimStats } from '../../utils/simulatorStats';
import type { SimMatch, SimStage, SimTeam } from '../../utils/simulator';

function team(id: string, seed: number): SimTeam {
  return {
    id,
    name: `Team ${seed}`,
    short_name: `T${seed}`,
    logo_url: null,
    seed,
    strength: 50,
    players: [],
  };
}

const A = team('a', 1);
const B = team('b', 2);
const C = team('c', 3);
const D = team('d', 4);

function match(id: string, overrides: Partial<SimMatch> = {}): SimMatch {
  return {
    id,
    round_number: 1,
    round_name: 'Round 1',
    position_in_round: 1,
    status: 'pending',
    match_format: 'bo3',
    best_of: 3,
    team1: null,
    team2: null,
    team1_id: null,
    team2_id: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    scheduled_at: null,
    maps: [],
    bracket_side: 'wb',
    next_match_win_idx: null,
    next_match_win_slot: null,
    next_match_lose_idx: null,
    next_match_lose_slot: null,
    next_match_win_id: null,
    next_match_lose_id: null,
    locked: false,
    ...overrides,
  };
}

function stage(matches: SimMatch[]): SimStage {
  return { id: 's1', name: 'Bracket', stage_type: 'single_elim', matches };
}

describe('computeSimStats', () => {
  const finished = match('m1', {
    status: 'finished',
    team1: A,
    team2: D,
    team1_id: 'a',
    team2_id: 'd',
    team1_score: 2,
    team2_score: 1,
    winner_team_id: 'a',
    scheduled_at: '2026-10-01T18:00:00Z',
    maps: [
      { name: 'Ilios', mode: 'Control' },
      { name: 'Dorado', mode: 'Escort' },
      { name: 'Ilios', mode: 'Control' },
    ],
  });
  const playable = match('m2', {
    round_number: 1,
    round_name: 'Demi-finale',
    team1: B,
    team2: C,
    team1_id: 'b',
    team2_id: 'c',
    scheduled_at: '2026-10-02T21:00:00Z',
  });
  const blocked = match('m3', {
    round_number: 2,
    round_name: 'Finale',
    team1: A,
    team1_id: 'a',
  });

  const stats = computeSimStats(
    [stage([finished, playable, blocked])],
    [A, B, C, D]
  );

  it('compte les matchs par statut', () => {
    expect(stats.total).toBe(3);
    expect(stats.finished).toBe(1);
    expect(stats.pending).toBe(2);
  });

  it('attribue victoires, défaites et maps des deux côtés', () => {
    expect(stats.wins.get('a')).toBe(1);
    expect(stats.losses.get('d')).toBe(1);
    expect(stats.mapWins.get('a')).toBe(2);
    expect(stats.mapLosses.get('a')).toBe(1);
    expect(stats.mapWins.get('d')).toBe(1);
    expect(stats.mapLosses.get('d')).toBe(2);
  });

  it('compte chaque map jouée', () => {
    expect(stats.mapCount.get('Ilios')).toBe(2);
    expect(stats.mapCount.get('Dorado')).toBe(1);
  });

  it("la prochaine manche est celle d'un match jouable (deux équipes)", () => {
    // m3 est en attente mais sans adversaire : il ne compte pas.
    expect(stats.nextRound).toBe(1);
    expect(stats.nextRoundName).toBe('Demi-finale');
  });

  it('estime la durée entre le premier et le dernier match planifié', () => {
    // 27 h. Affichait « 2j 3h » tant que le calcul arrondissait les jours au-dessus.
    expect(stats.estimatedDuration).toBe('1j 3h');
  });

  it('sans match, tout est à zéro ou nul', () => {
    const empty = computeSimStats([], []);
    expect(empty.total).toBe(0);
    expect(empty.nextRound).toBeNull();
    expect(empty.estimatedDuration).toBeNull();
  });
});
