import { describe, it, expect } from 'vitest';
import {
  computeRatingSeeding,
  SEEDING_DEFAULT_RATING,
  SEEDING_DEFAULT_SOS_WEIGHT,
  SEEDING_PROVISIONAL_RD,
  type SeedingTeamInput,
} from '../../utils/seeding/ratingSeeding';

const team = (
  teamId: string,
  overrides: Partial<SeedingTeamInput> = {}
): SeedingTeamInput => ({
  teamId,
  rating: 1500,
  rd: 50,
  gamesPlayed: 20,
  sos: 1500,
  ...overrides,
});

describe('computeRatingSeeding — method "rating"', () => {
  it('orders teams by rating DESC and assigns ranks 1..n', () => {
    const teams: SeedingTeamInput[] = [
      team('A', { rating: 1500 }),
      team('B', { rating: 1700 }),
      team('C', { rating: 1600 }),
    ];

    const result = computeRatingSeeding({ teams, method: 'rating' });

    expect(result.map((r) => r.teamId)).toEqual(['B', 'C', 'A']);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
    // score = rating en method 'rating'.
    expect(result[0]).toMatchObject({ teamId: 'B', score: 1700, rating: 1700 });
  });

  it('ignores SoS entirely in method "rating"', () => {
    const teams: SeedingTeamInput[] = [
      team('A', { rating: 1600, sos: 1000 }), // faible SoS
      team('B', { rating: 1600, sos: 2000 }), // fort SoS
    ];

    const result = computeRatingSeeding({ teams, method: 'rating' });

    // Rating egal + SoS ignore -> departage par rd puis teamId (A < B).
    expect(result[0].teamId).toBe('A');
    expect(result[0].score).toBe(1600);
    expect(result[1].score).toBe(1600);
  });
});

describe('computeRatingSeeding — method "rating_sos"', () => {
  it('breaks a rating tie in favour of the tougher schedule', () => {
    const teams: SeedingTeamInput[] = [
      team('A', { rating: 1600, sos: 1400 }), // adversaires faibles -> malus
      team('B', { rating: 1600, sos: 1700 }), // adversaires forts -> bonus
    ];

    const result = computeRatingSeeding({ teams, method: 'rating_sos' });

    expect(result[0].teamId).toBe('B');
    expect(result[1].teamId).toBe('A');
    // score B = 1600 + 0.15*(1700-1500) = 1630 ; A = 1600 + 0.15*(1400-1500) = 1585.
    expect(result[0].score).toBeCloseTo(1630, 6);
    expect(result[1].score).toBeCloseTo(1585, 6);
  });

  it('lets a strong SoS bonus overtake a higher raw rating', () => {
    // A a un meilleur rating brut mais un SoS tres faible ; B legerement plus
    // bas mais un SoS tres eleve. Avec un poids suffisant, B passe devant.
    const teams: SeedingTeamInput[] = [
      team('A', { rating: 1620, sos: 1300 }),
      team('B', { rating: 1600, sos: 1900 }),
    ];

    const result = computeRatingSeeding({
      teams,
      method: 'rating_sos',
      sosWeight: 0.2,
    });

    // A = 1620 + 0.2*(1300-1500) = 1580 ; B = 1600 + 0.2*(1900-1500) = 1680.
    expect(result[0].teamId).toBe('B');
    expect(result[0].score).toBeCloseTo(1680, 6);
    expect(result[1].score).toBeCloseTo(1580, 6);
  });

  it('uses the default SoS weight when none is provided', () => {
    const teams: SeedingTeamInput[] = [team('A', { rating: 1500, sos: 1600 })];
    const result = computeRatingSeeding({ teams, method: 'rating_sos' });
    expect(result[0].score).toBeCloseTo(
      1500 + SEEDING_DEFAULT_SOS_WEIGHT * (1600 - SEEDING_DEFAULT_RATING),
      6
    );
  });
});

describe('computeRatingSeeding — defaults for null inputs', () => {
  it('falls back to defaultRating for null rating and null sos', () => {
    const teams: SeedingTeamInput[] = [
      team('A', { rating: null, sos: null }),
    ];
    const result = computeRatingSeeding({ teams, method: 'rating_sos' });
    expect(result[0].rating).toBe(SEEDING_DEFAULT_RATING);
    expect(result[0].sos).toBe(SEEDING_DEFAULT_RATING);
    // sos == default -> aucun ajustement, score == rating.
    expect(result[0].score).toBe(SEEDING_DEFAULT_RATING);
  });

  it('honours a custom defaultRating', () => {
    const teams: SeedingTeamInput[] = [team('A', { rating: null, sos: null })];
    const result = computeRatingSeeding({
      teams,
      method: 'rating',
      defaultRating: 1000,
    });
    expect(result[0].rating).toBe(1000);
    expect(result[0].sos).toBe(1000);
    expect(result[0].score).toBe(1000);
  });
});

describe('computeRatingSeeding — provisional flag', () => {
  it('flags high rd, null rd and zero gamesPlayed as provisional', () => {
    const teams: SeedingTeamInput[] = [
      team('high-rd', { rd: SEEDING_PROVISIONAL_RD + 1 }),
      team('null-rd', { rd: null }),
      team('no-games', { gamesPlayed: 0 }),
      team('solid', { rd: 40, gamesPlayed: 30 }),
    ];

    const result = computeRatingSeeding({ teams, method: 'rating' });
    const byId = new Map(result.map((r) => [r.teamId, r]));

    expect(byId.get('high-rd')!.provisional).toBe(true);
    expect(byId.get('null-rd')!.provisional).toBe(true);
    expect(byId.get('no-games')!.provisional).toBe(true);
    expect(byId.get('solid')!.provisional).toBe(false);
  });

  it('treats rd exactly at the threshold as non-provisional', () => {
    const teams: SeedingTeamInput[] = [
      team('at-threshold', { rd: SEEDING_PROVISIONAL_RD, gamesPlayed: 10 }),
    ];
    const result = computeRatingSeeding({ teams, method: 'rating' });
    expect(result[0].provisional).toBe(false);
  });
});

describe('computeRatingSeeding — tie-breakers', () => {
  it('breaks equal score/rating by rd ASC (null rd last)', () => {
    const teams: SeedingTeamInput[] = [
      team('null-rd', { rating: 1500, rd: null }),
      team('high-rd', { rating: 1500, rd: 120 }),
      team('low-rd', { rating: 1500, rd: 30 }),
    ];

    const result = computeRatingSeeding({ teams, method: 'rating' });

    expect(result.map((r) => r.teamId)).toEqual([
      'low-rd',
      'high-rd',
      'null-rd',
    ]);
  });

  it('breaks equal score/rating/rd by gamesPlayed DESC then teamId ASC', () => {
    const teams: SeedingTeamInput[] = [
      team('few', { rating: 1500, rd: 50, gamesPlayed: 5 }),
      team('many', { rating: 1500, rd: 50, gamesPlayed: 25 }),
    ];

    const result = computeRatingSeeding({ teams, method: 'rating' });
    expect(result.map((r) => r.teamId)).toEqual(['many', 'few']);

    // Full tie -> teamId ASC.
    const tied: SeedingTeamInput[] = [
      team('zeta', { rating: 1500, rd: 50, gamesPlayed: 10 }),
      team('alpha', { rating: 1500, rd: 50, gamesPlayed: 10 }),
    ];
    const tiedResult = computeRatingSeeding({ teams: tied, method: 'rating' });
    expect(tiedResult.map((r) => r.teamId)).toEqual(['alpha', 'zeta']);
  });
});

describe('computeRatingSeeding — ranks and empty input', () => {
  it('assigns distinct ranks 1..n with no ties', () => {
    const teams: SeedingTeamInput[] = [
      team('A', { rating: 1500 }),
      team('B', { rating: 1500 }),
      team('C', { rating: 1500 }),
      team('D', { rating: 1500 }),
    ];
    const result = computeRatingSeeding({ teams, method: 'rating' });
    const ranks = result.map((r) => r.rank);
    expect(ranks).toEqual([1, 2, 3, 4]);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('returns [] for empty input', () => {
    expect(computeRatingSeeding({ teams: [], method: 'rating' })).toEqual([]);
    expect(
      computeRatingSeeding({ teams: [], method: 'rating_sos' })
    ).toEqual([]);
  });
});
