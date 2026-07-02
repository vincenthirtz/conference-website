import { describe, it, expect } from 'vitest';
import {
  computeStrengthOfSchedule,
  SOS_DEFAULT_RATING,
  type SoSMatch,
} from '../../utils/seeding/strengthOfSchedule';

const finished = (
  teamAId: string | null,
  teamBId: string | null,
  overrides: Partial<SoSMatch> = {}
): SoSMatch => ({
  teamAId,
  teamBId,
  status: 'finished',
  isBye: false,
  ...overrides,
});

describe('computeStrengthOfSchedule', () => {
  it('averages opponent ratings per team over counted matches', () => {
    const ratingByTeam = new Map<string, number>([
      ['A', 1600],
      ['B', 1400],
      ['C', 1500],
    ]);
    // A joue B (1400) et C (1500) -> moyenne 1450.
    const matches: SoSMatch[] = [finished('A', 'B'), finished('A', 'C')];

    const result = computeStrengthOfSchedule({ matches, ratingByTeam });

    expect(result.get('A')).toEqual({ sos: 1450, opponentCount: 2 });
    // B a joue A (1600) une fois.
    expect(result.get('B')).toEqual({ sos: 1600, opponentCount: 1 });
    // C a joue A (1600) une fois.
    expect(result.get('C')).toEqual({ sos: 1600, opponentCount: 1 });
  });

  it('counts repeated opponents per match (no dedup)', () => {
    const ratingByTeam = new Map<string, number>([
      ['A', 1500],
      ['B', 1000],
    ]);
    // A joue B deux fois -> moyenne 1000 sur 2 matchs.
    const matches: SoSMatch[] = [finished('A', 'B'), finished('A', 'B')];

    const result = computeStrengthOfSchedule({ matches, ratingByTeam });

    expect(result.get('A')).toEqual({ sos: 1000, opponentCount: 2 });
    expect(result.get('B')).toEqual({ sos: 1500, opponentCount: 2 });
  });

  it('counts walkover matches as well as finished', () => {
    const ratingByTeam = new Map<string, number>([
      ['A', 1500],
      ['B', 1800],
    ]);
    const matches: SoSMatch[] = [finished('A', 'B', { status: 'walkover' })];

    const result = computeStrengthOfSchedule({ matches, ratingByTeam });

    expect(result.get('A')).toEqual({ sos: 1800, opponentCount: 1 });
  });

  it('ignores non-finished / bye / incomplete matches', () => {
    const ratingByTeam = new Map<string, number>([
      ['A', 1600],
      ['B', 1400],
    ]);
    const matches: SoSMatch[] = [
      finished('A', 'B', { status: 'pending' }), // non compte
      finished('A', 'B', { status: 'live' }), // non compte
      finished('A', 'B', { isBye: true }), // bye
      finished('A', null), // teamB nul
      finished(null, 'B'), // teamA nul
    ];

    const result = computeStrengthOfSchedule({ matches, ratingByTeam });

    // Aucun match compte -> map vide (les absents = defaut, gere ailleurs).
    expect(result.size).toBe(0);
  });

  it('falls back to defaultRating for an opponent without a known rating', () => {
    const ratingByTeam = new Map<string, number>([['A', 1600]]);
    // B n'a pas de rating -> defaut.
    const matches: SoSMatch[] = [finished('A', 'B')];

    const result = computeStrengthOfSchedule({ matches, ratingByTeam });

    expect(result.get('A')).toEqual({
      sos: SOS_DEFAULT_RATING,
      opponentCount: 1,
    });
    // B a joue A (1600).
    expect(result.get('B')).toEqual({ sos: 1600, opponentCount: 1 });
  });

  it('honours a custom defaultRating for unknown opponents', () => {
    const ratingByTeam = new Map<string, number>([['A', 1600]]);
    const matches: SoSMatch[] = [finished('A', 'B')];

    const result = computeStrengthOfSchedule({
      matches,
      ratingByTeam,
      defaultRating: 1000,
    });

    expect(result.get('A')).toEqual({ sos: 1000, opponentCount: 1 });
  });

  it('produces no entry (neutral) for a team with no counted match', () => {
    const ratingByTeam = new Map<string, number>([
      ['A', 1600],
      ['B', 1400],
      ['Z', 1700],
    ]);
    // Z ne joue aucun match compte.
    const matches: SoSMatch[] = [finished('A', 'B')];

    const result = computeStrengthOfSchedule({ matches, ratingByTeam });

    expect(result.has('Z')).toBe(false);
  });

  it('never yields NaN even with no counted matches', () => {
    const result = computeStrengthOfSchedule({
      matches: [],
      ratingByTeam: new Map(),
    });
    expect(result.size).toBe(0);
    result.forEach((r) => {
      expect(Number.isNaN(r.sos)).toBe(false);
    });
  });
});
