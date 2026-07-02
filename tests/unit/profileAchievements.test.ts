import { describe, it, expect } from 'vitest';
import {
  computeAchievements,
  longestWinStreak,
  type AchievementsInput,
} from '../../utils/profile/achievements';
import type { ProfilePlacement, ProfileSeason } from '../../types/rating';

// ---------------------------------------------------------------------------
// Fabriques minimales
// ---------------------------------------------------------------------------

function placement(
  rank: number,
  overrides: Partial<ProfilePlacement> = {}
): ProfilePlacement {
  return {
    tournamentId: 't' + rank,
    tournamentName: 'Tournoi ' + rank,
    tournamentSlug: 'tournoi-' + rank,
    teamId: 'team1',
    teamName: 'Team One',
    rank,
    date: null,
    ...overrides,
  };
}

function season(
  rank: number | null,
  points: number,
  overrides: Partial<ProfileSeason> = {}
): ProfileSeason {
  return {
    leagueId: 'l1',
    leagueName: 'League 1',
    leagueSlug: 'league-1',
    teamId: 'team1',
    teamName: 'Team One',
    rank,
    points,
    ...overrides,
  };
}

function results(
  seq: ('win' | 'loss' | 'draw')[]
): AchievementsInput['results'] {
  return seq.map((r, i) => ({
    result: r,
    occurredAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
}

const EMPTY_STATS = { peakRating: 0, gamesPlayed: 0, wins: 0, losses: 0 };

function keys(input: AchievementsInput): string[] {
  return computeAchievements(input).badges.map((b) => b.key);
}

// ---------------------------------------------------------------------------
// Entrée vide
// ---------------------------------------------------------------------------

describe('computeAchievements — entrée vide', () => {
  it('renvoie tout vide sans NaN', () => {
    const out = computeAchievements({
      placements: [],
      stats: EMPTY_STATS,
      results: [],
      seasons: [],
    });
    expect(out.badges).toEqual([]);
    expect(out.palmares).toEqual([]);
    expect(out.seasons).toEqual([]);
  });

  it('tolère peakRating/gamesPlayed non finis sans NaN ni badge', () => {
    const out = computeAchievements({
      placements: [],
      stats: {
        peakRating: Number.NaN,
        gamesPlayed: Number.NaN,
        wins: 0,
        losses: 0,
      },
      results: [],
      seasons: [],
    });
    expect(out.badges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Badges de placement
// ---------------------------------------------------------------------------

describe('computeAchievements — badges de placement', () => {
  it('rank 1 => champion + podium + top_cut', () => {
    const k = keys({
      placements: [placement(1)],
      stats: EMPTY_STATS,
      results: [],
      seasons: [],
    });
    expect(k).toContain('champion');
    expect(k).toContain('podium');
    expect(k).toContain('top_cut');
    expect(k).not.toContain('finalist');
  });

  it('rank 2 => finalist + podium + top_cut, pas champion', () => {
    const k = keys({
      placements: [placement(2)],
      stats: EMPTY_STATS,
      results: [],
      seasons: [],
    });
    expect(k).toContain('finalist');
    expect(k).toContain('podium');
    expect(k).toContain('top_cut');
    expect(k).not.toContain('champion');
  });

  it('rank 3 => podium + top_cut, ni champion ni finalist', () => {
    const k = keys({
      placements: [placement(3)],
      stats: EMPTY_STATS,
      results: [],
      seasons: [],
    });
    expect(k).toContain('podium');
    expect(k).toContain('top_cut');
    expect(k).not.toContain('champion');
    expect(k).not.toContain('finalist');
  });

  it('rank 4 => top_cut seulement (pas de podium)', () => {
    const k = keys({
      placements: [placement(4)],
      stats: EMPTY_STATS,
      results: [],
      seasons: [],
    });
    expect(k).toContain('top_cut');
    expect(k).not.toContain('podium');
  });

  it('rank 8 => top_cut ; rank 9 => aucun badge de placement', () => {
    expect(
      keys({
        placements: [placement(8)],
        stats: EMPTY_STATS,
        results: [],
        seasons: [],
      })
    ).toContain('top_cut');
    expect(
      keys({
        placements: [placement(9)],
        stats: EMPTY_STATS,
        results: [],
        seasons: [],
      })
    ).not.toContain('top_cut');
  });

  it('champion et finalist coexistent sur des placements distincts', () => {
    const k = keys({
      placements: [placement(1), placement(2)],
      stats: EMPTY_STATS,
      results: [],
      seasons: [],
    });
    expect(k).toContain('champion');
    expect(k).toContain('finalist');
    expect(k).toContain('podium');
  });
});

// ---------------------------------------------------------------------------
// Badge de saison
// ---------------------------------------------------------------------------

describe('computeAchievements — league_winner', () => {
  it('saison rank 1 => league_winner (gold)', () => {
    const out = computeAchievements({
      placements: [],
      stats: EMPTY_STATS,
      results: [],
      seasons: [season(1, 100)],
    });
    const b = out.badges.find((x) => x.key === 'league_winner');
    expect(b).toBeDefined();
    expect(b?.tier).toBe('gold');
  });

  it('aucune saison rank 1 => pas de league_winner', () => {
    const k = keys({
      placements: [],
      stats: EMPTY_STATS,
      results: [],
      seasons: [season(2, 100), season(null, 50)],
    });
    expect(k).not.toContain('league_winner');
  });
});

// ---------------------------------------------------------------------------
// Paliers peak rating — un seul, le plus haut
// ---------------------------------------------------------------------------

describe('computeAchievements — palier de peak (un seul)', () => {
  it('peak 2100 => peak_master (platinum) seul', () => {
    const out = computeAchievements({
      placements: [],
      stats: { ...EMPTY_STATS, peakRating: 2100 },
      results: [],
      seasons: [],
    });
    const peakBadges = out.badges.filter((b) => b.key.startsWith('peak_'));
    expect(peakBadges).toHaveLength(1);
    expect(peakBadges[0].key).toBe('peak_master');
    expect(peakBadges[0].tier).toBe('platinum');
  });

  it('peak 1850 => peak_elite seul', () => {
    const out = computeAchievements({
      placements: [],
      stats: { ...EMPTY_STATS, peakRating: 1850 },
      results: [],
      seasons: [],
    });
    const peakBadges = out.badges.filter((b) => b.key.startsWith('peak_'));
    expect(peakBadges).toHaveLength(1);
    expect(peakBadges[0].key).toBe('peak_elite');
  });

  it('peak 1600 => peak_contender ; peak 1599 => aucun', () => {
    expect(
      keys({
        placements: [],
        stats: { ...EMPTY_STATS, peakRating: 1600 },
        results: [],
        seasons: [],
      })
    ).toContain('peak_contender');
    expect(
      keys({
        placements: [],
        stats: { ...EMPTY_STATS, peakRating: 1599 },
        results: [],
        seasons: [],
      }).filter((x) => x.startsWith('peak_'))
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Paliers expérience — un seul, le plus haut
// ---------------------------------------------------------------------------

describe('computeAchievements — palier expérience (un seul)', () => {
  it('120 games => veteran_legend seul', () => {
    const out = computeAchievements({
      placements: [],
      stats: { ...EMPTY_STATS, gamesPlayed: 120 },
      results: [],
      seasons: [],
    });
    const exp = out.badges.filter((b) =>
      ['veteran_legend', 'veteran', 'regular'].includes(b.key)
    );
    expect(exp).toHaveLength(1);
    expect(exp[0].key).toBe('veteran_legend');
  });

  it('50 games => veteran ; 10 => regular ; 9 => aucun', () => {
    expect(
      keys({
        placements: [],
        stats: { ...EMPTY_STATS, gamesPlayed: 50 },
        results: [],
        seasons: [],
      })
    ).toContain('veteran');
    expect(
      keys({
        placements: [],
        stats: { ...EMPTY_STATS, gamesPlayed: 10 },
        results: [],
        seasons: [],
      })
    ).toContain('regular');
    const nine = keys({
      placements: [],
      stats: { ...EMPTY_STATS, gamesPlayed: 9 },
      results: [],
      seasons: [],
    });
    expect(nine).not.toContain('regular');
    expect(nine).not.toContain('veteran');
  });
});

// ---------------------------------------------------------------------------
// Win streak
// ---------------------------------------------------------------------------

describe('longestWinStreak', () => {
  it('coupe la série sur loss et draw', () => {
    expect(
      longestWinStreak(
        results(['win', 'win', 'loss', 'win', 'win', 'win', 'draw', 'win'])
      )
    ).toBe(3);
  });
  it('aucune victoire => 0', () => {
    expect(longestWinStreak(results(['loss', 'draw']))).toBe(0);
  });
  it('série continue', () => {
    expect(longestWinStreak(results(['win', 'win', 'win', 'win']))).toBe(4);
  });
});

describe('computeAchievements — win_streak', () => {
  it('série de 7 => badge silver avec longueur exacte dans la description', () => {
    const out = computeAchievements({
      placements: [],
      stats: EMPTY_STATS,
      results: results([
        'win',
        'win',
        'win',
        'win',
        'win',
        'win',
        'win',
        'loss',
      ]),
      seasons: [],
    });
    const b = out.badges.find((x) => x.key === 'win_streak');
    expect(b).toBeDefined();
    expect(b?.tier).toBe('silver');
    expect(b?.description).toBe("7 victoires d'affilée.");
  });

  it('série de 10+ => gold', () => {
    const out = computeAchievements({
      placements: [],
      stats: EMPTY_STATS,
      results: results(Array(11).fill('win')),
      seasons: [],
    });
    const b = out.badges.find((x) => x.key === 'win_streak');
    expect(b?.tier).toBe('gold');
    expect(b?.description).toBe("11 victoires d'affilée.");
  });

  it('série de 4 => pas de badge (< 5)', () => {
    const k = keys({
      placements: [],
      stats: EMPTY_STATS,
      results: results(['win', 'win', 'win', 'win', 'loss', 'win']),
      seasons: [],
    });
    expect(k).not.toContain('win_streak');
  });
});

// ---------------------------------------------------------------------------
// Dédup par key + meilleur tier
// ---------------------------------------------------------------------------

describe('computeAchievements — dédup par key', () => {
  it('deux placements rank 1 => un seul badge champion', () => {
    const out = computeAchievements({
      placements: [placement(1), placement(1, { tournamentId: 'other' })],
      stats: EMPTY_STATS,
      results: [],
      seasons: [],
    });
    expect(out.badges.filter((b) => b.key === 'champion')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Ordre des badges
// ---------------------------------------------------------------------------

describe('computeAchievements — ordre des badges', () => {
  it('champion avant peak avant veteran avant win_streak', () => {
    const out = computeAchievements({
      placements: [placement(1)],
      stats: { ...EMPTY_STATS, peakRating: 1850, gamesPlayed: 60 },
      results: results(Array(6).fill('win')),
      seasons: [],
    });
    const order = out.badges.map((b) => b.key);
    expect(order.indexOf('champion')).toBeLessThan(order.indexOf('peak_elite'));
    expect(order.indexOf('peak_elite')).toBeLessThan(order.indexOf('veteran'));
    expect(order.indexOf('veteran')).toBeLessThan(order.indexOf('win_streak'));
  });
});

// ---------------------------------------------------------------------------
// Tri palmarès
// ---------------------------------------------------------------------------

describe('computeAchievements — tri palmarès', () => {
  it('rank ASC puis date DESC (null en dernier à rang égal)', () => {
    const out = computeAchievements({
      placements: [
        placement(3, { tournamentId: 'c' }),
        placement(1, { tournamentId: 'a-old', date: '2025-01-01' }),
        placement(1, { tournamentId: 'a-new', date: '2026-01-01' }),
        placement(1, { tournamentId: 'a-null', date: null }),
      ],
      stats: EMPTY_STATS,
      results: [],
      seasons: [],
    });
    expect(out.palmares.map((p) => p.tournamentId)).toEqual([
      'a-new',
      'a-old',
      'a-null',
      'c',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tri seasons
// ---------------------------------------------------------------------------

describe('computeAchievements — tri seasons', () => {
  it('rank ASC (null en dernier) puis points DESC', () => {
    const out = computeAchievements({
      placements: [],
      stats: EMPTY_STATS,
      results: [],
      seasons: [
        season(null, 10, { leagueId: 'null-lo' }),
        season(2, 999, { leagueId: 'r2' }),
        season(1, 50, { leagueId: 'r1-lo' }),
        season(1, 300, { leagueId: 'r1-hi' }),
        season(null, 80, { leagueId: 'null-hi' }),
      ],
    });
    expect(out.seasons.map((s) => s.leagueId)).toEqual([
      'r1-hi',
      'r1-lo',
      'r2',
      'null-hi',
      'null-lo',
    ]);
  });
});
