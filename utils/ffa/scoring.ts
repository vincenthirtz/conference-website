// utils/ffa/scoring.ts
// FFA (Free-For-All / N-competitor) scoring — pure logic, no DB access.
//
// An FFA lobby groups N teams together; each team is assigned a finishing
// PLACEMENT (1 = winner, ties allowed). A per-stage points table converts a
// placement into POINTS. There is no winner_team_id and no two-team match —
// this layer is intentionally isolated from the team-vs-team `matches` engine.

/** rank (as a string key, e.g. "1") → points awarded for that placement. */
export type FfaPointsTable = Record<string, number>;

/**
 * Points awarded for a given placement.
 *
 * - `placement` null or not present in the table → 0.
 * - Non-finite / non-integer / < 1 placements → 0 (defensive guard).
 * - A points value that is non-finite or negative in the table → treated as 0.
 */
export function pointsForPlacement(
  table: FfaPointsTable,
  placement: number | null
): number {
  if (placement === null || !Number.isFinite(placement)) return 0;
  if (!Number.isInteger(placement) || placement < 1) return 0;

  const raw = table[String(placement)];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

/**
 * Compute each team's points for a single lobby, given the entered placements.
 *
 * Tie handling: teams that share the same `placement` value EACH receive the
 * points for that placement (no averaging, no splitting). This is simple and
 * predictable — e.g. two teams tied for 1st both get the "1" points, and the
 * next distinct entered placement keeps its own points as entered. Placement
 * gaps are the operator's responsibility when entering results.
 */
export function computeLobbyPoints(
  table: FfaPointsTable,
  entries: { teamId: string; placement: number | null; score?: number | null }[]
): { teamId: string; placement: number | null; points: number }[] {
  return entries.map((e) => ({
    teamId: e.teamId,
    placement: e.placement,
    points: pointsForPlacement(table, e.placement),
  }));
}
