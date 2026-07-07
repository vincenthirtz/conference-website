import { describe, it, expect } from 'vitest';
import {
  pointsForPlacement,
  computeLobbyPoints,
  type FfaPointsTable,
} from '../../utils/ffa/scoring';

const TABLE: FfaPointsTable = {
  '1': 100,
  '2': 80,
  '3': 60,
  '4': 50,
};

describe('pointsForPlacement', () => {
  it('returns the table value for an in-table placement', () => {
    expect(pointsForPlacement(TABLE, 1)).toBe(100);
    expect(pointsForPlacement(TABLE, 3)).toBe(60);
  });

  it('returns 0 for a placement not in the table', () => {
    expect(pointsForPlacement(TABLE, 5)).toBe(0);
    expect(pointsForPlacement(TABLE, 99)).toBe(0);
  });

  it('returns 0 for null placement', () => {
    expect(pointsForPlacement(TABLE, null)).toBe(0);
  });

  it('returns 0 for non-finite / invalid placements', () => {
    expect(pointsForPlacement(TABLE, Number.NaN)).toBe(0);
    expect(pointsForPlacement(TABLE, Number.POSITIVE_INFINITY)).toBe(0);
    expect(pointsForPlacement(TABLE, 0)).toBe(0);
    expect(pointsForPlacement(TABLE, -1)).toBe(0);
    expect(pointsForPlacement(TABLE, 2.5)).toBe(0);
  });

  it('guards against non-finite / negative points values in the table', () => {
    const bad: FfaPointsTable = {
      '1': Number.NaN,
      '2': -10,
      '3': Number.POSITIVE_INFINITY,
    };
    expect(pointsForPlacement(bad, 1)).toBe(0);
    expect(pointsForPlacement(bad, 2)).toBe(0);
    expect(pointsForPlacement(bad, 3)).toBe(0);
  });
});

describe('computeLobbyPoints', () => {
  it('computes points for a normal lobby', () => {
    const result = computeLobbyPoints(TABLE, [
      { teamId: 'a', placement: 1 },
      { teamId: 'b', placement: 2 },
      { teamId: 'c', placement: 3 },
      { teamId: 'd', placement: 4 },
    ]);
    expect(result).toEqual([
      { teamId: 'a', placement: 1, points: 100 },
      { teamId: 'b', placement: 2, points: 80 },
      { teamId: 'c', placement: 3, points: 60 },
      { teamId: 'd', placement: 4, points: 50 },
    ]);
  });

  it('gives tied teams the same points (both get the shared placement value)', () => {
    const result = computeLobbyPoints(TABLE, [
      { teamId: 'a', placement: 1 },
      { teamId: 'b', placement: 1 },
      { teamId: 'c', placement: 3 },
    ]);
    expect(result).toEqual([
      { teamId: 'a', placement: 1, points: 100 },
      { teamId: 'b', placement: 1, points: 100 },
      { teamId: 'c', placement: 3, points: 60 },
    ]);
  });

  it('assigns 0 points to null and out-of-table placements', () => {
    const result = computeLobbyPoints(TABLE, [
      { teamId: 'a', placement: null },
      { teamId: 'b', placement: 9 },
      { teamId: 'c', placement: 2, score: 12 },
    ]);
    expect(result).toEqual([
      { teamId: 'a', placement: null, points: 0 },
      { teamId: 'b', placement: 9, points: 0 },
      { teamId: 'c', placement: 2, points: 80 },
    ]);
  });

  it('returns an empty array for no entries', () => {
    expect(computeLobbyPoints(TABLE, [])).toEqual([]);
  });
});
