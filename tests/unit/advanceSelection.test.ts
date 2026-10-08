// Sélection des équipes à faire avancer : une équipe disqualifiée n'est
// jamais sélectionnable, quel que soit le geste (case, « tout », Top N…).

import { describe, expect, it } from 'vitest';
import {
  areAllSelected,
  countSelected,
  orderedSelection,
  selectByMinScore,
  selectByMinWins,
  selectTopN,
  toggleAll,
  toggleTeam,
} from '@/features/admin/stages/advanceSelection';

const standings = [
  { teamId: 'a', score: 9, wins: 3 },
  { teamId: 'b', score: 6, wins: 2 },
  { teamId: 'c', score: 3, wins: 1 },
  // Disqualifiée : classée en dernier par le serveur, chiffres conservés.
  { teamId: 'dq', score: 9, wins: 3, disqualified: true },
];

const ids = (s: Set<string>) => [...s].sort();

describe('advanceSelection', () => {
  it('Top N : les N premières équipes sélectionnables', () => {
    expect(ids(selectTopN(standings, 2))).toEqual(['a', 'b']);
    expect(ids(selectTopN(standings, 10))).toEqual(['a', 'b', 'c']);
    // Même si une disqualifiée était devant (ordre non garanti côté client).
    const dqFirst = [standings[3], ...standings.slice(0, 3)];
    expect(ids(selectTopN(dqFirst, 1))).toEqual(['a']);
    expect(selectTopN(standings, 0).size).toBe(0);
  });

  it('score mini / victoires mini : disqualifiée exclue malgré ses chiffres', () => {
    expect(ids(selectByMinScore(standings, 9))).toEqual(['a']);
    expect(ids(selectByMinWins(standings, 2))).toEqual(['a', 'b']);
  });

  it('case à cocher : une disqualifiée ne peut pas être cochée', () => {
    const one = toggleTeam(new Set(), 'dq', standings);
    expect(one.size).toBe(0);
    // Et elle est retirée si elle était déjà cochée (disqualifiée entre-temps).
    expect(ids(toggleTeam(new Set(['dq', 'a']), 'dq', standings))).toEqual([
      'a',
    ]);
    expect(ids(toggleTeam(new Set(), 'b', standings))).toEqual(['b']);
    expect(toggleTeam(new Set(['b']), 'b', standings).size).toBe(0);
  });

  it('tout sélectionner : seulement les sélectionnables, puis rien', () => {
    const all = toggleAll(new Set(), standings);
    expect(ids(all)).toEqual(['a', 'b', 'c']);
    expect(areAllSelected(standings, all)).toBe(true);
    expect(toggleAll(all, standings).size).toBe(0);
  });

  it('compte et ordre effectifs : la disqualifiée ne compte pas', () => {
    const selected = new Set(['c', 'dq', 'a']);
    expect(countSelected(standings, selected)).toBe(2);
    expect(orderedSelection(standings, selected)).toEqual(['a', 'c']);
    expect(areAllSelected(standings, selected)).toBe(false);
  });

  it('aucune équipe sélectionnable : « tout » n’est jamais coché', () => {
    const onlyDq = [standings[3]];
    expect(areAllSelected(onlyDq, new Set())).toBe(false);
    expect(toggleAll(new Set(), onlyDq).size).toBe(0);
  });
});
