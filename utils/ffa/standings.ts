// utils/ffa/standings.ts
// FFA standings aggregation — pure logic, no DB access.
//
// Aggregates a stage's lobby placements (already converted to points via
// utils/ffa/scoring) into a single ranked standings table.

export type FfaTiebreak = 'total_points' | 'best_placement' | 'most_firsts';

export type FfaStandingRow = {
  teamId: string;
  totalPoints: number;
  lobbiesPlayed: number;
  bestPlacement: number | null; // lowest placement number achieved
  firsts: number; // count of placement === 1
  rank: number; // 1-based, ties share rank
};

/**
 * Aggregate placements across all of a stage's lobbies into a sorted, ranked
 * standings table.
 *
 * Sorting:
 *   1. totalPoints descending.
 *   2. Secondary tiebreak:
 *      - 'best_placement' (default): lower bestPlacement first (null last).
 *      - 'most_firsts': more `firsts` first.
 *      - 'total_points': no secondary key.
 *   3. Final deterministic tiebreak on teamId (ascending) for stable output.
 *
 * Ranking: standard competition ranking ("1224") — rows that are equal on the
 * ranking keys (totalPoints + the chosen tiebreak) share a rank, and the next
 * distinct row skips ahead by the number of tied rows.
 */
export function computeFfaStandings(
  placements: { teamId: string; placement: number | null; points: number }[],
  tiebreak: FfaTiebreak = 'best_placement'
): FfaStandingRow[] {
  const byTeam = new Map<
    string,
    {
      totalPoints: number;
      lobbiesPlayed: number;
      bestPlacement: number | null;
      firsts: number;
    }
  >();

  for (const p of placements) {
    let agg = byTeam.get(p.teamId);
    if (!agg) {
      agg = {
        totalPoints: 0,
        lobbiesPlayed: 0,
        bestPlacement: null,
        firsts: 0,
      };
      byTeam.set(p.teamId, agg);
    }

    const pts = Number.isFinite(p.points) ? p.points : 0;
    agg.totalPoints += pts;
    agg.lobbiesPlayed += 1;

    if (
      p.placement !== null &&
      Number.isFinite(p.placement) &&
      Number.isInteger(p.placement) &&
      p.placement >= 1
    ) {
      if (agg.bestPlacement === null || p.placement < agg.bestPlacement) {
        agg.bestPlacement = p.placement;
      }
      if (p.placement === 1) agg.firsts += 1;
    }
  }

  const rows: Omit<FfaStandingRow, 'rank'>[] = Array.from(byTeam.entries()).map(
    ([teamId, agg]) => ({
      teamId,
      totalPoints: agg.totalPoints,
      lobbiesPlayed: agg.lobbiesPlayed,
      bestPlacement: agg.bestPlacement,
      firsts: agg.firsts,
    })
  );

  // Lower bestPlacement is better; null (never placed) sorts last.
  const bestPlacementKey = (v: number | null): number =>
    v === null ? Number.POSITIVE_INFINITY : v;

  // Returns negative if `a` should rank above `b`, on the ranking keys only
  // (excludes the deterministic teamId tiebreak).
  const compareRankKeys = (
    a: Omit<FfaStandingRow, 'rank'>,
    b: Omit<FfaStandingRow, 'rank'>
  ): number => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;

    if (tiebreak === 'best_placement') {
      const ak = bestPlacementKey(a.bestPlacement);
      const bk = bestPlacementKey(b.bestPlacement);
      if (ak !== bk) return ak - bk;
    } else if (tiebreak === 'most_firsts') {
      if (a.firsts !== b.firsts) return b.firsts - a.firsts;
    }
    return 0;
  };

  rows.sort((a, b) => {
    const primary = compareRankKeys(a, b);
    if (primary !== 0) return primary;
    // Deterministic, stable final ordering.
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });

  // Standard competition ranking: ties (equal on ranking keys) share a rank.
  const result: FfaStandingRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    let rank: number;
    if (i === 0 || compareRankKeys(rows[i - 1], rows[i]) !== 0) {
      rank = i + 1;
    } else {
      rank = result[i - 1].rank;
    }
    result.push({ ...rows[i], rank });
  }

  return result;
}
