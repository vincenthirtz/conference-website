import { describe, it, expect } from 'vitest';
import { generateSwissPairings } from '../../utils/swiss/pairing';
import type { SwissParticipant, SwissPastMatch } from '../../types/swiss';

function makeParticipants(count: number): SwissParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    score: 0,
    seed: i + 1,
  }));
}

describe('generateSwissPairings', () => {
  it('returns empty pairings for empty participants', () => {
    const result = generateSwissPairings({
      participants: [],
      pastMatches: [],
    });
    expect(result.pairings).toEqual([]);
    expect(result.hasRematches).toBe(false);
  });

  it('pairs even number of participants without rematches', () => {
    const participants = makeParticipants(4);
    const result = generateSwissPairings({
      participants,
      pastMatches: [],
    });

    expect(result.pairings).toHaveLength(2);
    expect(result.hasRematches).toBe(false);

    // All participants should be in pairings
    const ids = result.pairings.flatMap((p) => [p.player1Id, p.player2Id]);
    expect(new Set(ids)).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
  });

  it('assigns a bye for odd number of participants', () => {
    const participants = makeParticipants(3);
    const result = generateSwissPairings({
      participants,
      pastMatches: [],
    });

    const byePairing = result.pairings.find((p) => p.isBye);
    expect(byePairing).toBeDefined();
    expect(byePairing!.player2Id).toBeNull();

    const normalPairings = result.pairings.filter((p) => !p.isBye);
    expect(normalPairings).toHaveLength(1);
  });

  it('bye goes to lowest score + lowest seed', () => {
    const participants: SwissParticipant[] = [
      { id: 'p1', score: 3, seed: 1 },
      { id: 'p2', score: 0, seed: 2 },
      { id: 'p3', score: 3, seed: 3 },
    ];

    const result = generateSwissPairings({
      participants,
      pastMatches: [],
    });

    const byePairing = result.pairings.find((p) => p.isBye);
    // p2 has lowest score (0) so gets bye
    expect(byePairing!.player1Id).toBe('p2');
  });

  it('avoids rematches when possible', () => {
    const participants: SwissParticipant[] = [
      { id: 'p1', score: 3, seed: 1 },
      { id: 'p2', score: 3, seed: 2 },
      { id: 'p3', score: 0, seed: 3 },
      { id: 'p4', score: 0, seed: 4 },
    ];

    const pastMatches: SwissPastMatch[] = [
      { round: 1, player1Id: 'p1', player2Id: 'p2' },
      { round: 1, player1Id: 'p3', player2Id: 'p4' },
    ];

    const result = generateSwissPairings({
      participants,
      pastMatches,
    });

    expect(result.hasRematches).toBe(false);

    // Verify no rematch
    for (const p of result.pairings) {
      if (p.isBye) continue;
      const matchup = [p.player1Id, p.player2Id].sort().join('-');
      expect(matchup).not.toBe('p1-p2');
      expect(matchup).not.toBe('p3-p4');
    }
  });

  it('falls back to rematches when unavoidable', () => {
    // 2 participants who already played each other
    const participants: SwissParticipant[] = [
      { id: 'p1', score: 3, seed: 1 },
      { id: 'p2', score: 0, seed: 2 },
    ];

    const pastMatches: SwissPastMatch[] = [
      { round: 1, player1Id: 'p1', player2Id: 'p2' },
    ];

    const result = generateSwissPairings({
      participants,
      pastMatches,
      allowRematchesFallback: true,
    });

    expect(result.pairings).toHaveLength(1);
    expect(result.hasRematches).toBe(true);
  });

  it('throws when rematches unavoidable and fallback disabled', () => {
    const participants: SwissParticipant[] = [
      { id: 'p1', score: 3, seed: 1 },
      { id: 'p2', score: 0, seed: 2 },
    ];

    const pastMatches: SwissPastMatch[] = [
      { round: 1, player1Id: 'p1', player2Id: 'p2' },
    ];

    expect(() =>
      generateSwissPairings({
        participants,
        pastMatches,
        allowRematchesFallback: false,
      })
    ).toThrow();
  });

  it('handles 6 participants with prior rounds correctly', () => {
    const participants: SwissParticipant[] = [
      { id: 'p1', score: 6, seed: 1 },
      { id: 'p2', score: 6, seed: 2 },
      { id: 'p3', score: 3, seed: 3 },
      { id: 'p4', score: 3, seed: 4 },
      { id: 'p5', score: 0, seed: 5 },
      { id: 'p6', score: 0, seed: 6 },
    ];

    const pastMatches: SwissPastMatch[] = [
      { round: 1, player1Id: 'p1', player2Id: 'p2' },
      { round: 1, player1Id: 'p3', player2Id: 'p4' },
      { round: 1, player1Id: 'p5', player2Id: 'p6' },
      { round: 2, player1Id: 'p1', player2Id: 'p3' },
      { round: 2, player1Id: 'p2', player2Id: 'p5' },
      { round: 2, player1Id: 'p4', player2Id: 'p6' },
    ];

    const result = generateSwissPairings({
      participants,
      pastMatches,
    });

    expect(result.pairings).toHaveLength(3);
    // All 6 players should be paired
    const ids = result.pairings.flatMap((p) => [p.player1Id, p.player2Id]);
    expect(new Set(ids).size).toBe(6);
  });
});
