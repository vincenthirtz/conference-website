// Tests unit pour computeWinnerFromScores (utils/matches/applyScore.ts).
// Fonction pure — pas de DB. (P2-A)

import { describe, it, expect } from 'vitest';
import { computeWinnerFromScores } from '../../utils/matches/applyScore';

describe('computeWinnerFromScores', () => {
  const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('team1 > team2 : team1 wins', () => {
    expect(computeWinnerFromScores(A, B, 3, 1, false)).toBe(A);
  });

  it('team2 > team1 : team2 wins', () => {
    expect(computeWinnerFromScores(A, B, 0, 3, false)).toBe(B);
  });

  it('égalité : null', () => {
    expect(computeWinnerFromScores(A, B, 2, 2, false)).toBeNull();
  });

  it('bye avec team1 présente : team1 wins automatiquement', () => {
    expect(computeWinnerFromScores(A, null, 0, 0, true)).toBe(A);
  });

  it('bye avec team2 présente : team2 wins automatiquement', () => {
    expect(computeWinnerFromScores(null, B, 0, 0, true)).toBe(B);
  });

  it('bye sans team : null', () => {
    expect(computeWinnerFromScores(null, null, 0, 0, true)).toBeNull();
  });

  it('match mal configuré (team1 manquant, non-bye) : null', () => {
    expect(computeWinnerFromScores(null, B, 3, 0, false)).toBeNull();
  });

  it('match mal configuré (team2 manquant, non-bye) : null', () => {
    expect(computeWinnerFromScores(A, null, 3, 0, false)).toBeNull();
  });
});
