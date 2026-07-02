import { describe, it, expect } from 'vitest';
import { deriveTeamRatings } from '../../utils/rating/deriveTeamRatings';
import { DEFAULT_RATING } from '../../utils/rating/glicko2';

describe('deriveTeamRatings', () => {
  it('averages ratings and rd of known members', () => {
    const rostersByTeam = new Map<string, string[]>([['T1', ['u1', 'u2']]]);
    const playerRatings = new Map<string, { rating: number; rd: number }>([
      ['u1', { rating: 1600, rd: 100 }],
      ['u2', { rating: 1400, rd: 200 }],
    ]);
    const result = deriveTeamRatings({ rostersByTeam, playerRatings });
    const t1 = result.get('T1');
    expect(t1).toEqual({ rating: 1500, rd: 150, rosterSize: 2 });
  });

  it('ignores unknown user_ids and counts only known members', () => {
    const rostersByTeam = new Map<string, string[]>([
      ['T1', ['u1', 'ghost', 'u2']],
    ]);
    const playerRatings = new Map<string, { rating: number; rd: number }>([
      ['u1', { rating: 1500, rd: 80 }],
      ['u2', { rating: 1700, rd: 120 }],
    ]);
    const result = deriveTeamRatings({ rostersByTeam, playerRatings });
    const t1 = result.get('T1');
    expect(t1).toEqual({ rating: 1600, rd: 100, rosterSize: 2 });
  });

  it('returns DEFAULT_RATING / null rd / rosterSize 0 for an empty roster', () => {
    const rostersByTeam = new Map<string, string[]>([['T1', []]]);
    const playerRatings = new Map<string, { rating: number; rd: number }>();
    const result = deriveTeamRatings({ rostersByTeam, playerRatings });
    expect(result.get('T1')).toEqual({
      rating: DEFAULT_RATING,
      rd: null,
      rosterSize: 0,
    });
  });

  it('returns DEFAULT_RATING when the whole roster is unknown', () => {
    const rostersByTeam = new Map<string, string[]>([['T1', ['x', 'y']]]);
    const playerRatings = new Map<string, { rating: number; rd: number }>([
      ['other', { rating: 2000, rd: 50 }],
    ]);
    const result = deriveTeamRatings({ rostersByTeam, playerRatings });
    expect(result.get('T1')).toEqual({
      rating: DEFAULT_RATING,
      rd: null,
      rosterSize: 0,
    });
  });

  it('handles multiple teams independently', () => {
    const rostersByTeam = new Map<string, string[]>([
      ['T1', ['u1']],
      ['T2', ['u2', 'u3']],
    ]);
    const playerRatings = new Map<string, { rating: number; rd: number }>([
      ['u1', { rating: 1500, rd: 100 }],
      ['u2', { rating: 1000, rd: 200 }],
      ['u3', { rating: 2000, rd: 100 }],
    ]);
    const result = deriveTeamRatings({ rostersByTeam, playerRatings });
    expect(result.get('T1')).toEqual({ rating: 1500, rd: 100, rosterSize: 1 });
    expect(result.get('T2')).toEqual({ rating: 1500, rd: 150, rosterSize: 2 });
  });
});
