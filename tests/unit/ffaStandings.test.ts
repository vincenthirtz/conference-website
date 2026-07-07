import { describe, it, expect } from 'vitest';
import {
  computeFfaStandings,
  type FfaStandingRow,
} from '../../utils/ffa/standings';

const rowFor = (rows: FfaStandingRow[], teamId: string): FfaStandingRow => {
  const r = rows.find((x) => x.teamId === teamId);
  if (!r) throw new Error(`missing row for ${teamId}`);
  return r;
};

describe('computeFfaStandings', () => {
  it('returns empty array for empty input', () => {
    expect(computeFfaStandings([])).toEqual([]);
  });

  it('aggregates points and placements across multiple lobbies', () => {
    const rows = computeFfaStandings([
      // lobby 1
      { teamId: 'a', placement: 1, points: 100 },
      { teamId: 'b', placement: 2, points: 80 },
      { teamId: 'c', placement: 3, points: 60 },
      // lobby 2
      { teamId: 'a', placement: 3, points: 60 },
      { teamId: 'b', placement: 1, points: 100 },
      { teamId: 'c', placement: 2, points: 80 },
    ]);

    const a = rowFor(rows, 'a');
    expect(a.totalPoints).toBe(160);
    expect(a.lobbiesPlayed).toBe(2);
    expect(a.bestPlacement).toBe(1);
    expect(a.firsts).toBe(1);

    const b = rowFor(rows, 'b');
    expect(b.totalPoints).toBe(180);
    expect(b.bestPlacement).toBe(1);
    expect(b.firsts).toBe(1);
  });

  it('sorts by totalPoints descending and assigns competition ranks', () => {
    const rows = computeFfaStandings([
      { teamId: 'low', placement: 3, points: 10 },
      { teamId: 'high', placement: 1, points: 100 },
      { teamId: 'mid', placement: 2, points: 50 },
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(['high', 'mid', 'low']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied teams the same rank and skips the next (1,2,2,4)', () => {
    // total_points tiebreak → only totalPoints decides ties.
    const rows = computeFfaStandings(
      [
        { teamId: 'a', placement: 1, points: 100 },
        { teamId: 'b', placement: 1, points: 50 },
        { teamId: 'c', placement: 1, points: 50 },
        { teamId: 'd', placement: 1, points: 10 },
      ],
      'total_points'
    );
    expect(rows.map((r) => r.teamId)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('best_placement tiebreak: lower bestPlacement ranks first', () => {
    const rows = computeFfaStandings(
      [
        // both 100 total points
        { teamId: 'a', placement: 4, points: 100 },
        { teamId: 'b', placement: 2, points: 100 },
      ],
      'best_placement'
    );
    expect(rows.map((r) => r.teamId)).toEqual(['b', 'a']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('best_placement tiebreak: null bestPlacement sorts last', () => {
    const rows = computeFfaStandings(
      [
        { teamId: 'placed', placement: 5, points: 40 },
        { teamId: 'unplaced', placement: null, points: 40 },
      ],
      'best_placement'
    );
    expect(rows.map((r) => r.teamId)).toEqual(['placed', 'unplaced']);
    expect(rowFor(rows, 'unplaced').bestPlacement).toBeNull();
  });

  it('most_firsts tiebreak: more firsts ranks first', () => {
    const rows = computeFfaStandings(
      [
        // a: 2 firsts, b: 1 first — same total points
        { teamId: 'a', placement: 1, points: 50 },
        { teamId: 'a', placement: 1, points: 50 },
        { teamId: 'b', placement: 1, points: 100 },
      ],
      'most_firsts'
    );
    expect(rows.map((r) => r.teamId)).toEqual(['a', 'b']);
    expect(rowFor(rows, 'a').firsts).toBe(2);
    expect(rowFor(rows, 'b').firsts).toBe(1);
  });

  it('uses teamId as a deterministic final tiebreak', () => {
    const rows = computeFfaStandings(
      [
        { teamId: 'zeta', placement: 1, points: 50 },
        { teamId: 'alpha', placement: 1, points: 50 },
      ],
      'total_points'
    );
    // Identical on every ranking key → alpha before zeta, shared rank 1.
    expect(rows.map((r) => r.teamId)).toEqual(['alpha', 'zeta']);
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('defaults to best_placement tiebreak when none supplied', () => {
    const rows = computeFfaStandings([
      { teamId: 'a', placement: 4, points: 100 },
      { teamId: 'b', placement: 2, points: 100 },
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(['b', 'a']);
  });

  it('treats non-finite points defensively as 0', () => {
    const rows = computeFfaStandings([
      { teamId: 'a', placement: 1, points: Number.NaN },
      { teamId: 'a', placement: 2, points: 80 },
    ]);
    expect(rowFor(rows, 'a').totalPoints).toBe(80);
  });
});
