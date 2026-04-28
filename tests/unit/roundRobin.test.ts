import { describe, it, expect } from 'vitest';
import { generateRoundRobinPairings } from '../../utils/groups/roundRobin';

function pairKey(t1: string | null, t2: string | null): string {
  // Normalize so (a, b) and (b, a) collide.
  const a = t1 ?? '';
  const b = t2 ?? '';
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

describe('generateRoundRobinPairings', () => {
  it('returns empty for fewer than 2 teams', () => {
    expect(generateRoundRobinPairings([])).toEqual([]);
    expect(generateRoundRobinPairings(['a'])).toEqual([]);
  });

  it('returns empty when rounds < 1', () => {
    expect(generateRoundRobinPairings(['a', 'b', 'c'], 0)).toEqual([]);
    expect(generateRoundRobinPairings(['a', 'b', 'c'], -1)).toEqual([]);
  });

  it('produces (n-1) rounds × n/2 matches for an even count', () => {
    const teams = ['a', 'b', 'c', 'd'];
    const pairings = generateRoundRobinPairings(teams, 1);

    // n=4 → 3 rounds × 2 matches = 6 pairings, no BYEs
    expect(pairings).toHaveLength(6);
    expect(pairings.every((p) => p.team1Id && p.team2Id)).toBe(true);

    // Round numbers cover 1..3, two matches per round
    const roundCounts = new Map<number, number>();
    for (const p of pairings) {
      roundCounts.set(p.round, (roundCounts.get(p.round) ?? 0) + 1);
    }
    expect([...roundCounts.entries()].sort()).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
  });

  it('every pair of teams meets exactly once in a single cycle (even N)', () => {
    const teams = ['a', 'b', 'c', 'd'];
    const pairings = generateRoundRobinPairings(teams, 1);

    const seen = new Set<string>();
    for (const p of pairings) {
      const key = pairKey(p.team1Id, p.team2Id);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      // No team plays itself
      expect(p.team1Id).not.toBe(p.team2Id);
    }

    // 4 teams choose 2 = 6 distinct pairs
    expect(seen.size).toBe(6);
  });

  it('produces n rounds with one BYE per round for an odd count', () => {
    const teams = ['a', 'b', 'c'];
    const pairings = generateRoundRobinPairings(teams, 1);

    // n=3 → after BYE inject, n_eff=4 → 3 rounds × 2 entries = 6 total
    // (1 BYE + 1 real match per round)
    expect(pairings).toHaveLength(6);

    const byes = pairings.filter((p) => p.team2Id === null);
    const real = pairings.filter((p) => p.team2Id !== null);
    expect(byes).toHaveLength(3);
    expect(real).toHaveLength(3);

    // Each real team gets exactly one BYE across the cycle
    const byeTeams = byes.map((p) => p.team1Id).sort();
    expect(byeTeams).toEqual(['a', 'b', 'c']);
  });

  it('every pair meets exactly once in a single odd-N cycle', () => {
    const teams = ['a', 'b', 'c', 'd', 'e'];
    const pairings = generateRoundRobinPairings(teams, 1);

    const realPairs = pairings.filter((p) => p.team2Id !== null);
    // 5 choose 2 = 10
    expect(realPairs).toHaveLength(10);

    const seen = new Set<string>();
    for (const p of realPairs) {
      seen.add(pairKey(p.team1Id, p.team2Id));
    }
    expect(seen.size).toBe(10);
  });

  it('never pairs the BYE placeholder against itself or leaks it as team2', () => {
    const teams = ['a', 'b', 'c'];
    const pairings = generateRoundRobinPairings(teams, 1);

    for (const p of pairings) {
      expect(p.team1Id).not.toBe('__BYE__');
      expect(p.team2Id).not.toBe('__BYE__');
    }
  });

  it('reverses team1/team2 sides on the second cycle (home/away)', () => {
    const pairings = generateRoundRobinPairings(['a', 'b'], 2);

    // n=2 → roundsPerCycle=1, half=1. 2 cycles × 1 round = 2 pairings.
    expect(pairings).toHaveLength(2);
    expect(pairings[0]).toMatchObject({ round: 1, team1Id: 'a', team2Id: 'b' });
    expect(pairings[1]).toMatchObject({ round: 2, team1Id: 'b', team2Id: 'a' });
  });

  it('numbers rounds continuously across cycles', () => {
    const pairings = generateRoundRobinPairings(['a', 'b', 'c', 'd'], 2);

    // 2 cycles × 3 rounds × 2 matches = 12 pairings, rounds 1..6
    expect(pairings).toHaveLength(12);
    const rounds = new Set(pairings.map((p) => p.round));
    expect([...rounds].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('two-team double round-robin yields exactly the two home/away matches', () => {
    const pairings = generateRoundRobinPairings(['x', 'y'], 2);
    expect(pairings).toHaveLength(2);
    const pairs = pairings.map((p) => `${p.team1Id}>${p.team2Id}`).sort();
    expect(pairs).toEqual(['x>y', 'y>x']);
  });
});
