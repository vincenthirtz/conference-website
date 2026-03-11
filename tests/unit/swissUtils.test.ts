import { describe, it, expect } from 'vitest';
import {
  defaultSwissScoreConfig,
  outcomeToSwissResult,
  outcomesToSwissResults,
  resultToPastMatch,
  resultsToPastMatches,
  getPlayerMatchHistory,
  getPlayerOpponents,
  havePlayersMet,
  countMatchesBetween,
} from '../../utils/swiss/utils';
import type { SwissMatchResult, RawOutcomeInput } from '../../types/swiss';

describe('defaultSwissScoreConfig', () => {
  it('has standard esport values', () => {
    expect(defaultSwissScoreConfig).toEqual({
      win: 3,
      draw: 1,
      loss: 0,
      bye: 3,
    });
  });
});

describe('outcomeToSwissResult', () => {
  it('converts a win outcome', () => {
    const input: RawOutcomeInput = {
      round: 1,
      player1Id: 'A',
      player2Id: 'B',
      outcomeForP1: 'win',
    };
    const result = outcomeToSwissResult(input);
    expect(result).toEqual({
      round: 1,
      player1Id: 'A',
      player2Id: 'B',
      player1Score: 3,
      player2Score: 0,
    });
  });

  it('converts a loss outcome', () => {
    const result = outcomeToSwissResult({
      round: 1,
      player1Id: 'A',
      player2Id: 'B',
      outcomeForP1: 'loss',
    });
    expect(result.player1Score).toBe(0);
    expect(result.player2Score).toBe(3);
  });

  it('converts a draw outcome', () => {
    const result = outcomeToSwissResult({
      round: 2,
      player1Id: 'A',
      player2Id: 'B',
      outcomeForP1: 'draw',
    });
    expect(result.player1Score).toBe(1);
    expect(result.player2Score).toBe(1);
  });

  it('converts a bye outcome', () => {
    const result = outcomeToSwissResult({
      round: 1,
      player1Id: 'A',
      player2Id: null,
      outcomeForP1: 'bye',
    });
    expect(result).toEqual({
      round: 1,
      player1Id: 'A',
      player2Id: null,
      player1Score: 3,
      player2Score: 0,
    });
  });

  it('treats null player2Id as bye regardless of outcome', () => {
    const result = outcomeToSwissResult({
      round: 1,
      player1Id: 'A',
      player2Id: null,
      outcomeForP1: 'win',
    });
    expect(result.player2Id).toBeNull();
    expect(result.player1Score).toBe(3); // bye score
  });

  it('uses custom score config', () => {
    const config = { win: 1, draw: 0.5, loss: 0, bye: 1 };
    const result = outcomeToSwissResult(
      { round: 1, player1Id: 'A', player2Id: 'B', outcomeForP1: 'draw' },
      config
    );
    expect(result.player1Score).toBe(0.5);
    expect(result.player2Score).toBe(0.5);
  });

  it('throws on unknown outcome', () => {
    expect(() =>
      outcomeToSwissResult({
        round: 1,
        player1Id: 'A',
        player2Id: 'B',
        outcomeForP1: 'unknown' as any,
      })
    ).toThrow('Outcome inconnu');
  });
});

describe('outcomesToSwissResults', () => {
  it('converts a list of outcomes', () => {
    const inputs: RawOutcomeInput[] = [
      { round: 1, player1Id: 'A', player2Id: 'B', outcomeForP1: 'win' },
      { round: 1, player1Id: 'C', player2Id: null, outcomeForP1: 'bye' },
    ];
    const results = outcomesToSwissResults(inputs);
    expect(results).toHaveLength(2);
    expect(results[0].player1Score).toBe(3);
    expect(results[1].player2Id).toBeNull();
  });
});

describe('resultToPastMatch', () => {
  it('extracts round/player IDs from a result', () => {
    const result: SwissMatchResult = {
      round: 2,
      player1Id: 'A',
      player2Id: 'B',
      player1Score: 3,
      player2Score: 0,
    };
    expect(resultToPastMatch(result)).toEqual({
      round: 2,
      player1Id: 'A',
      player2Id: 'B',
    });
  });
});

describe('resultsToPastMatches', () => {
  it('converts a list of results', () => {
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'A', player2Id: 'B', player1Score: 3, player2Score: 0 },
      { round: 1, player1Id: 'C', player2Id: null, player1Score: 3, player2Score: 0 },
    ];
    const past = resultsToPastMatches(results);
    expect(past).toHaveLength(2);
    expect(past[0]).not.toHaveProperty('player1Score');
  });
});

// Shared fixtures for history tests
const sampleResults: SwissMatchResult[] = [
  { round: 1, player1Id: 'A', player2Id: 'B', player1Score: 3, player2Score: 0 },
  { round: 1, player1Id: 'C', player2Id: 'D', player1Score: 0, player2Score: 3 },
  { round: 2, player1Id: 'A', player2Id: 'C', player1Score: 1, player2Score: 1 },
  { round: 2, player1Id: 'B', player2Id: null, player1Score: 3, player2Score: 0 }, // bye
  { round: 3, player1Id: 'A', player2Id: 'B', player1Score: 0, player2Score: 3 },
];

describe('getPlayerMatchHistory', () => {
  it('returns all matches for a player', () => {
    const history = getPlayerMatchHistory(sampleResults, 'A');
    expect(history).toHaveLength(3); // rounds 1, 2, 3
  });

  it('returns empty for unknown player', () => {
    expect(getPlayerMatchHistory(sampleResults, 'Z')).toHaveLength(0);
  });

  it('includes matches where player is player2', () => {
    const history = getPlayerMatchHistory(sampleResults, 'D');
    expect(history).toHaveLength(1);
    expect(history[0].round).toBe(1);
  });
});

describe('getPlayerOpponents', () => {
  it('returns unique opponent IDs', () => {
    const opponents = getPlayerOpponents(sampleResults, 'A');
    expect(new Set(opponents)).toEqual(new Set(['B', 'C']));
  });

  it('excludes bye opponents (null player2Id)', () => {
    const opponents = getPlayerOpponents(sampleResults, 'B');
    // B played A in round 1 & 3, had bye in round 2
    expect(opponents).toContain('A');
    expect(opponents).not.toContain(null);
  });

  it('returns empty for unknown player', () => {
    expect(getPlayerOpponents(sampleResults, 'Z')).toEqual([]);
  });
});

describe('havePlayersMet', () => {
  it('returns true when players have met', () => {
    expect(havePlayersMet(sampleResults, 'A', 'B')).toBe(true);
  });

  it('returns true regardless of order', () => {
    expect(havePlayersMet(sampleResults, 'B', 'A')).toBe(true);
  });

  it('returns false when players have not met', () => {
    expect(havePlayersMet(sampleResults, 'A', 'D')).toBe(false);
  });

  it('returns false for same player', () => {
    expect(havePlayersMet(sampleResults, 'A', 'A')).toBe(false);
  });

  it('returns false for empty results', () => {
    expect(havePlayersMet([], 'A', 'B')).toBe(false);
  });
});

describe('countMatchesBetween', () => {
  it('counts multiple encounters', () => {
    // A vs B: round 1 and round 3
    expect(countMatchesBetween(sampleResults, 'A', 'B')).toBe(2);
  });

  it('counts regardless of order', () => {
    expect(countMatchesBetween(sampleResults, 'B', 'A')).toBe(2);
  });

  it('returns 0 for players who never met', () => {
    expect(countMatchesBetween(sampleResults, 'A', 'D')).toBe(0);
  });

  it('returns 0 for same player', () => {
    expect(countMatchesBetween(sampleResults, 'A', 'A')).toBe(0);
  });

  it('returns 1 for single encounter', () => {
    expect(countMatchesBetween(sampleResults, 'C', 'D')).toBe(1);
  });
});
