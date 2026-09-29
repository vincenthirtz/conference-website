// features/admin/ratings/schemas.ts — rating joueur (Glicko-2) côté staff :
// couverture (`/api/admin/ratings/coverage`) et recalcul complet
// (`/api/admin/ratings/rebuild`).

export type RatingCoverageReason =
  | 'no_participants'
  | 'one_side_only'
  | 'unknown';

export type RatingCoverageSample = {
  matchId: string;
  reason: RatingCoverageReason;
  team1: string | null;
  team2: string | null;
  completedAt: string | null;
};

export type RatingCoverageResponse = {
  finished: number;
  rated: number;
  unrated: number;
  samples: RatingCoverageSample[];
};

export const MAX_COVERAGE_SAMPLES = 20;
