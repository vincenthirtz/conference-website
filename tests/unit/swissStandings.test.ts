import { describe, it, expect } from 'vitest';
import {
  computeSwissStandings,
  rankSwissStandings,
} from '../../utils/swiss/standings';
import {
  outcomeToSwissResult,
  defaultSwissScoreConfig,
  getPlayerOpponents,
  havePlayersMet,
  countMatchesBetween,
} from '../../utils/swiss/utils';
import type {
  SwissMatchResult,
  SwissStandingParticipant,
} from '../../types/swiss';

const participants: SwissStandingParticipant[] = [
  { id: 'A', name: 'Alpha', seed: 1 },
  { id: 'B', name: 'Beta', seed: 2 },
  { id: 'C', name: 'Charlie', seed: 3 },
  { id: 'D', name: 'Delta', seed: 4 },
];

describe('computeSwissStandings', () => {
  it('returns all participants with zero scores when no results', () => {
    const standings = computeSwissStandings({ participants, results: [] });
    expect(standings).toHaveLength(4);
    for (const s of standings) {
      expect(s.score).toBe(0);
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(0);
      expect(s.draws).toBe(0);
      expect(s.buchholz).toBe(0);
    }
  });

  it('correctly accumulates scores from results', () => {
    const results: SwissMatchResult[] = [
      // A beats B: A gets 3, B gets 0
      { round: 1, player1Id: 'A', player2Id: 'B', player1Score: 3, player2Score: 0 },
      // C beats D: C gets 3, D gets 0
      { round: 1, player1Id: 'C', player2Id: 'D', player1Score: 3, player2Score: 0 },
    ];

    const standings = computeSwissStandings({ participants, results });
    const byId = Object.fromEntries(standings.map((s) => [s.id, s]));

    expect(byId['A'].score).toBe(3);
    expect(byId['A'].wins).toBe(1);
    expect(byId['B'].score).toBe(0);
    expect(byId['B'].losses).toBe(1);
    expect(byId['C'].score).toBe(3);
    expect(byId['D'].score).toBe(0);
  });

  it('handles draws correctly', () => {
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'A', player2Id: 'B', player1Score: 1, player2Score: 1 },
    ];

    const standings = computeSwissStandings({ participants, results });
    const byId = Object.fromEntries(standings.map((s) => [s.id, s]));

    expect(byId['A'].draws).toBe(1);
    expect(byId['B'].draws).toBe(1);
    expect(byId['A'].score).toBe(1);
    expect(byId['B'].score).toBe(1);
  });

  it('handles byes', () => {
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'A', player2Id: null, player1Score: 3, player2Score: 0 },
    ];

    const standings = computeSwissStandings({ participants, results });
    const a = standings.find((s) => s.id === 'A')!;

    expect(a.score).toBe(3);
    expect(a.hadBye).toBe(true);
    expect(a.wins).toBe(1);
    // Bye opponent not counted for buchholz
    expect(a.opponents).toHaveLength(0);
  });

  it('calculates Buchholz correctly', () => {
    // Round 1: A beats B, C beats D
    // Round 2: A beats C, B beats D
    // Scores: A=6, B=3, C=3, D=0
    // A's opponents: B(3) + C(3) → Buchholz=6
    // B's opponents: A(6) + D(0) → Buchholz=6
    // C's opponents: D(0) + A(6) → Buchholz=6
    // D's opponents: C(3) + B(3) → Buchholz=6
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'A', player2Id: 'B', player1Score: 3, player2Score: 0 },
      { round: 1, player1Id: 'C', player2Id: 'D', player1Score: 3, player2Score: 0 },
      { round: 2, player1Id: 'A', player2Id: 'C', player1Score: 3, player2Score: 0 },
      { round: 2, player1Id: 'B', player2Id: 'D', player1Score: 3, player2Score: 0 },
    ];

    const standings = computeSwissStandings({ participants, results });
    const byId = Object.fromEntries(standings.map((s) => [s.id, s]));

    expect(byId['A'].buchholz).toBe(6); // B(3) + C(3)
    expect(byId['D'].buchholz).toBe(6); // C(3) + B(3)
  });

  it('sorts by score DESC, then Buchholz DESC', () => {
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'A', player2Id: 'B', player1Score: 3, player2Score: 0 },
      { round: 1, player1Id: 'C', player2Id: 'D', player1Score: 3, player2Score: 0 },
      { round: 2, player1Id: 'A', player2Id: 'C', player1Score: 3, player2Score: 0 },
      { round: 2, player1Id: 'B', player2Id: 'D', player1Score: 3, player2Score: 0 },
    ];

    const standings = computeSwissStandings({ participants, results });

    // A=6pts, C=3pts, B=3pts, D=0pts
    expect(standings[0].id).toBe('A');
    expect(standings[standings.length - 1].id).toBe('D');
  });
});

describe('rankSwissStandings', () => {
  it('assigns sequential ranks', () => {
    const standings = computeSwissStandings({ participants, results: [] });
    const ranked = rankSwissStandings(standings);

    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[3].rank).toBe(4);
  });
});

describe('outcomeToSwissResult', () => {
  it('converts win outcome', () => {
    const result = outcomeToSwissResult({
      round: 1,
      player1Id: 'A',
      player2Id: 'B',
      outcomeForP1: 'win',
    });
    expect(result.player1Score).toBe(3);
    expect(result.player2Score).toBe(0);
  });

  it('converts loss outcome', () => {
    const result = outcomeToSwissResult({
      round: 1,
      player1Id: 'A',
      player2Id: 'B',
      outcomeForP1: 'loss',
    });
    expect(result.player1Score).toBe(0);
    expect(result.player2Score).toBe(3);
  });

  it('converts draw outcome', () => {
    const result = outcomeToSwissResult({
      round: 1,
      player1Id: 'A',
      player2Id: 'B',
      outcomeForP1: 'draw',
    });
    expect(result.player1Score).toBe(1);
    expect(result.player2Score).toBe(1);
  });

  it('converts bye outcome', () => {
    const result = outcomeToSwissResult({
      round: 1,
      player1Id: 'A',
      player2Id: null,
      outcomeForP1: 'bye',
    });
    expect(result.player1Score).toBe(3);
    expect(result.player2Id).toBeNull();
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
});

describe('swiss utils helpers', () => {
  const results: SwissMatchResult[] = [
    { round: 1, player1Id: 'A', player2Id: 'B', player1Score: 3, player2Score: 0 },
    { round: 1, player1Id: 'C', player2Id: null, player1Score: 3, player2Score: 0 },
    { round: 2, player1Id: 'A', player2Id: 'C', player1Score: 3, player2Score: 0 },
  ];

  it('getPlayerOpponents excludes byes', () => {
    const opps = getPlayerOpponents(results, 'C');
    expect(opps).toEqual(['A']);
  });

  it('havePlayersMet returns true for past opponents', () => {
    expect(havePlayersMet(results, 'A', 'B')).toBe(true);
    expect(havePlayersMet(results, 'B', 'A')).toBe(true);
  });

  it('havePlayersMet returns false for players who never met', () => {
    expect(havePlayersMet(results, 'B', 'C')).toBe(false);
  });

  it('countMatchesBetween counts matches', () => {
    expect(countMatchesBetween(results, 'A', 'B')).toBe(1);
    expect(countMatchesBetween(results, 'A', 'C')).toBe(1);
    expect(countMatchesBetween(results, 'B', 'C')).toBe(0);
  });
});
