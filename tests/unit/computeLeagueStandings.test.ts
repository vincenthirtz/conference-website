import { describe, it, expect } from 'vitest';
import {
  computeLeagueStandings,
  type LeagueTournamentRef,
  type LeagueRankingRow,
} from '../../utils/leagues/computeStandings';

const pointsTable: Record<string, number> = {
  '1': 100,
  '2': 60,
  '3': 40,
  '4': 20,
};

describe('computeLeagueStandings — points = table × weight', () => {
  it('applies the tournament weight to the placement points', () => {
    const tournaments: LeagueTournamentRef[] = [
      { tournamentId: 't1', weight: 2 },
    ];
    const rankings: LeagueRankingRow[] = [
      { tournamentId: 't1', teamId: 'A', rank: 1 },
      { tournamentId: 't1', teamId: 'B', rank: 2 },
    ];
    const rows = computeLeagueStandings({ tournaments, rankings, pointsTable });
    const a = rows.find((r) => r.teamId === 'A');
    const b = rows.find((r) => r.teamId === 'B');
    expect(a?.points).toBe(200); // 100 * 2
    expect(b?.points).toBe(120); // 60 * 2
  });
});

describe('computeLeagueStandings — cumulative multi-tournament', () => {
  it('sums points, counts tournaments, tracks bestRank', () => {
    const tournaments: LeagueTournamentRef[] = [
      { tournamentId: 't1', weight: 1 },
      { tournamentId: 't2', weight: 1 },
    ];
    const rankings: LeagueRankingRow[] = [
      { tournamentId: 't1', teamId: 'A', rank: 2 }, // 60
      { tournamentId: 't2', teamId: 'A', rank: 1 }, // 100
      { tournamentId: 't1', teamId: 'B', rank: 1 }, // 100
    ];
    const rows = computeLeagueStandings({ tournaments, rankings, pointsTable });
    const a = rows.find((r) => r.teamId === 'A');
    const b = rows.find((r) => r.teamId === 'B');
    expect(a?.points).toBe(160);
    expect(a?.tournamentsCounted).toBe(2);
    expect(a?.bestRank).toBe(1);
    expect(b?.points).toBe(100);
    expect(b?.tournamentsCounted).toBe(1);
    expect(b?.bestRank).toBe(1);
  });
});

describe('computeLeagueStandings — ordering and rank assignment', () => {
  it('sorts by points DESC, bestRank ASC, teamId ASC and assigns 1..n', () => {
    const tournaments: LeagueTournamentRef[] = [
      { tournamentId: 't1', weight: 1 },
    ];
    const rankings: LeagueRankingRow[] = [
      { tournamentId: 't1', teamId: 'A', rank: 1 }, // 100
      { tournamentId: 't1', teamId: 'B', rank: 1 }, // 100 — tie on points+bestRank
      { tournamentId: 't1', teamId: 'C', rank: 2 }, // 60
    ];
    const rows = computeLeagueStandings({ tournaments, rankings, pointsTable });

    // A and B tie (100 pts, bestRank 1) -> broken by teamId ASC: A then B.
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks equal points by bestRank ASC', () => {
    const tournaments: LeagueTournamentRef[] = [
      { tournamentId: 't1', weight: 1 },
      { tournamentId: 't2', weight: 1 },
    ];
    // X: rank1 (100). Y: rank2 + rank4 (60 + 20 = 80). Give both 100 via weight.
    const rankings: LeagueRankingRow[] = [
      { tournamentId: 't1', teamId: 'X', rank: 2 }, // 60
      { tournamentId: 't2', teamId: 'X', rank: 3 }, // 40  => 100, bestRank 2
      { tournamentId: 't1', teamId: 'Y', rank: 1 }, // 100, bestRank 1
    ];
    const rows = computeLeagueStandings({ tournaments, rankings, pointsTable });
    // Both have 100 points; Y has bestRank 1 < X bestRank 2 => Y first.
    expect(rows.map((r) => r.teamId)).toEqual(['Y', 'X']);
  });
});

describe('computeLeagueStandings — edge cases', () => {
  it('rank outside the points table scores 0 points', () => {
    const tournaments: LeagueTournamentRef[] = [
      { tournamentId: 't1', weight: 3 },
    ];
    const rankings: LeagueRankingRow[] = [
      { tournamentId: 't1', teamId: 'A', rank: 99 },
    ];
    const rows = computeLeagueStandings({ tournaments, rankings, pointsTable });
    const a = rows.find((r) => r.teamId === 'A');
    expect(a?.points).toBe(0);
    expect(a?.tournamentsCounted).toBe(1);
    expect(a?.bestRank).toBe(99);
  });

  it('ignores rankings from tournaments not linked to the league', () => {
    const tournaments: LeagueTournamentRef[] = [
      { tournamentId: 't1', weight: 1 },
    ];
    const rankings: LeagueRankingRow[] = [
      { tournamentId: 't1', teamId: 'A', rank: 1 },
      { tournamentId: 'stranger', teamId: 'A', rank: 1 }, // ignored
      { tournamentId: 'stranger', teamId: 'Z', rank: 1 }, // Z never appears
    ];
    const rows = computeLeagueStandings({ tournaments, rankings, pointsTable });
    const a = rows.find((r) => r.teamId === 'A');
    expect(a?.points).toBe(100);
    expect(a?.tournamentsCounted).toBe(1);
    expect(rows.find((r) => r.teamId === 'Z')).toBeUndefined();
  });

  it('returns an empty array when there are no rankings', () => {
    const rows = computeLeagueStandings({
      tournaments: [{ tournamentId: 't1', weight: 1 }],
      rankings: [],
      pointsTable,
    });
    expect(rows).toEqual([]);
  });
});
