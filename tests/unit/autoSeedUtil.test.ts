import { describe, it, expect } from 'vitest';
import {
  buildSeedOrder,
  generateBracketPositions,
  computeProposedSeeding,
} from '../../utils/stages/autoSeed';

describe('generateBracketPositions', () => {
  it('size=2 → [1, 2]', () => {
    expect(generateBracketPositions(2)).toEqual([1, 2]);
  });

  it('size=4 → [1, 4, 2, 3] (1 vs 4 in match 1, 2 vs 3 in match 2)', () => {
    expect(generateBracketPositions(4)).toEqual([1, 4, 2, 3]);
  });

  it('size=8 → 1 paired with 8, 4 with 5, 2 with 7, 3 with 6', () => {
    expect(generateBracketPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('size=16 → first match pairs seed 1 with seed 16', () => {
    const r = generateBracketPositions(16);
    expect(r[0]).toBe(1);
    expect(r[1]).toBe(16);
    // 16 positions total
    expect(r).toHaveLength(16);
    // No duplicate seeds
    expect(new Set(r).size).toBe(16);
  });
});

describe('buildSeedOrder', () => {
  it('sequential: 2 matches → [(0,1),(0,2),(1,1),(1,2)]', () => {
    expect(buildSeedOrder(2, 'sequential')).toEqual([
      { matchIndex: 0, slot: 1 },
      { matchIndex: 0, slot: 2 },
      { matchIndex: 1, slot: 1 },
      { matchIndex: 1, slot: 2 },
    ]);
  });

  it('standard: 2 matches → canonical 1v4 / 2v3 pairing', () => {
    const order = buildSeedOrder(2, 'standard');
    // order[i] = location for the rank (i+1) team.
    // Standard pairing for 4 teams : m0 = 1v4, m1 = 2v3.
    expect(order).toEqual([
      { matchIndex: 0, slot: 1 }, // rank 1 → m0 slot 1
      { matchIndex: 1, slot: 1 }, // rank 2 → m1 slot 1
      { matchIndex: 1, slot: 2 }, // rank 3 → m1 slot 2
      { matchIndex: 0, slot: 2 }, // rank 4 → m0 slot 2
    ]);
  });
});

describe('computeProposedSeeding', () => {
  it('returns [] when no bracket matches', () => {
    const r = computeProposedSeeding({
      standings: [
        { teamId: 't1', rank: 1 },
        { teamId: 't2', rank: 2 },
      ],
      bracketMatches: [],
      pattern: 'standard',
    });
    expect(r).toEqual([]);
  });

  it('returns [] when no standings', () => {
    const r = computeProposedSeeding({
      standings: [],
      bracketMatches: [{ matchId: 'm1' }],
      pattern: 'standard',
    });
    expect(r).toEqual([]);
  });

  it('sequential : seed 1→m1.slot1, seed 2→m1.slot2', () => {
    const r = computeProposedSeeding({
      standings: [
        { teamId: 't1', rank: 1 },
        { teamId: 't2', rank: 2 },
        { teamId: 't3', rank: 3 },
        { teamId: 't4', rank: 4 },
      ],
      bracketMatches: [{ matchId: 'm1' }, { matchId: 'm2' }],
      pattern: 'sequential',
    });
    expect(r).toEqual([
      { matchId: 'm1', slot: 1, teamId: 't1', seed: 1 },
      { matchId: 'm1', slot: 2, teamId: 't2', seed: 2 },
      { matchId: 'm2', slot: 1, teamId: 't3', seed: 3 },
      { matchId: 'm2', slot: 2, teamId: 't4', seed: 4 },
    ]);
  });

  it('standard : top seed avoids #2 in round 1 (4 teams → 1 vs 4, 2 vs 3)', () => {
    const r = computeProposedSeeding({
      standings: [
        { teamId: 't1', rank: 1 },
        { teamId: 't2', rank: 2 },
        { teamId: 't3', rank: 3 },
        { teamId: 't4', rank: 4 },
      ],
      bracketMatches: [{ matchId: 'm1' }, { matchId: 'm2' }],
      pattern: 'standard',
    });
    // Iteration produces entries in rank order : r[i] is for rank (i+1).
    expect(r[0]).toEqual({ matchId: 'm1', slot: 1, teamId: 't1', seed: 1 });
    expect(r[1]).toEqual({ matchId: 'm2', slot: 1, teamId: 't2', seed: 2 });
    expect(r[2]).toEqual({ matchId: 'm2', slot: 2, teamId: 't3', seed: 3 });
    expect(r[3]).toEqual({ matchId: 'm1', slot: 2, teamId: 't4', seed: 4 });

    // Effective pairings : m1 = 1 vs 4, m2 = 2 vs 3.
    const m1 = r.filter((s) => s.matchId === 'm1').sort((a, b) => a.slot - b.slot);
    expect(m1.map((s) => s.seed)).toEqual([1, 4]);
    const m2 = r.filter((s) => s.matchId === 'm2').sort((a, b) => a.slot - b.slot);
    expect(m2.map((s) => s.seed)).toEqual([2, 3]);
  });

  it('caps at bracketSize when more standings than slots', () => {
    const r = computeProposedSeeding({
      standings: [
        { teamId: 't1', rank: 1 },
        { teamId: 't2', rank: 2 },
        { teamId: 't3', rank: 3 },
        { teamId: 't4', rank: 4 },
        { teamId: 't5', rank: 5 },
        { teamId: 't6', rank: 6 },
      ],
      bracketMatches: [{ matchId: 'm1' }, { matchId: 'm2' }],
      pattern: 'standard',
    });
    expect(r).toHaveLength(4);
    expect(r.every((s) => ['t1', 't2', 't3', 't4'].includes(s.teamId))).toBe(
      true
    );
  });
});
