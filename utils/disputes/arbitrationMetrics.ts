// utils/disputes/arbitrationMetrics.ts
//
// PURE aggregation of a single tournament's dispute (arbitration) activity into
// a NON-NOMINATIVE summary — only counts / durations / rates, never an id, a
// team, a reason or any player-identifying field. This is the data brick behind
// the public "serious ops" arbitration dashboard (roadmap #09).
//
// The function is deterministic (`nowMs` is an argument, never `Date.now()`)
// and robust to nulls and re-openings:
//   - A re-opened dispute has `dispute_resolved_at = null` again (see
//     `pages/api/admin/matches/[matchId]/dispute.ts`), so it is naturally
//     counted as OPEN, not resolved.
//   - Rows missing `dispute_opened_at` still count toward `totalDisputes` when
//     `status = 'disputed'`, but contribute no resolution duration.
//
// SLA classification of OPEN disputes reuses `classifyAge` from `slaBreaches.ts`
// (the same thresholds admin/bot/cron rely on) — we do NOT re-implement it.

import { ageInMinutes, classifyAge } from './slaBreaches';

/**
 * Minimal shape consumed from a `matches` row. Only dispute-related fields —
 * deliberately no team/reason/id so callers can't accidentally leak PII through
 * this util.
 */
export type ArbitrationMatchRow = {
  status?: string | null;
  dispute_opened_at?: string | null;
  dispute_resolved_at?: string | null;
};

/** Counts of currently-open disputes bucketed by SLA proximity. */
export type OpenBreakdown = {
  breached: number;
  approaching: number;
  fresh: number;
};

/** Non-nominative arbitration aggregate for a single tournament. */
export type ArbitrationMetrics = {
  /** Matches that have had a dispute (opened_at set OR status='disputed'). */
  totalDisputes: number;
  /** Currently unresolved disputes (status='disputed'). */
  open: number;
  /** Disputes with a resolution timestamp (dispute_resolved_at set). */
  resolved: number;
  /** Mean resolution time in minutes over resolved rows; null if none. */
  avgResolutionMinutes: number | null;
  /** Median resolution time in minutes over resolved rows; null if none. */
  medianResolutionMinutes: number | null;
  /** Resolved rows whose resolution time was <= SLA. */
  withinSlaCount: number;
  /** withinSlaCount / resolved (0..1); null when resolved=0. */
  slaComplianceRate: number | null;
  /** SLA breakdown of the OPEN disputes (via classifyAge). */
  openBreakdown: OpenBreakdown;
  /** SLA window in minutes used for the classification/compliance maths. */
  slaMinutes: number;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Compute the aggregate for one tournament's dispute rows.
 *
 * @param rows      dispute-field projection of the tournament's matches
 * @param slaMinutes tenant SLA (minutes) — use `getSlaMinutes` from slaBreaches
 * @param nowMs     reference "now" in ms epoch (injected for determinism)
 */
export function computeArbitrationMetrics(
  rows: ArbitrationMatchRow[],
  slaMinutes: number,
  nowMs: number
): ArbitrationMetrics {
  const safeRows = Array.isArray(rows) ? rows : [];

  let totalDisputes = 0;
  let open = 0;
  let resolved = 0;
  let withinSlaCount = 0;
  const openBreakdown: OpenBreakdown = {
    breached: 0,
    approaching: 0,
    fresh: 0,
  };
  const resolutionMinutes: number[] = [];

  for (const row of safeRows) {
    const status = typeof row?.status === 'string' ? row.status : null;
    const openedAt = isNonEmptyString(row?.dispute_opened_at)
      ? row.dispute_opened_at
      : null;
    const resolvedAt = isNonEmptyString(row?.dispute_resolved_at)
      ? row.dispute_resolved_at
      : null;
    const isDisputed = status === 'disputed';

    // A match "had a dispute" if it carries an opened_at, is currently
    // disputed, or has a resolution timestamp. Re-opened rows (resolved_at
    // reset to null) still satisfy this via opened_at / status.
    if (openedAt !== null || isDisputed || resolvedAt !== null) {
      totalDisputes += 1;
    }

    // OPEN = currently disputed. Bucket by SLA age.
    if (isDisputed) {
      open += 1;
      const age = ageInMinutes(openedAt, nowMs);
      const cls = classifyAge(age, slaMinutes);
      openBreakdown[cls] += 1;
    }

    // RESOLVED = has a resolution timestamp. `dispute` route resets this to
    // null on re-open, so a re-opened match never double-counts here.
    if (resolvedAt !== null) {
      resolved += 1;
      // Resolution duration needs both endpoints. Guard finite + non-negative
      // (clock skew / manual edits shouldn't yield negative durations).
      if (openedAt !== null) {
        const openedMs = Date.parse(openedAt);
        const resolvedMs = Date.parse(resolvedAt);
        if (Number.isFinite(openedMs) && Number.isFinite(resolvedMs)) {
          const minutes = Math.floor((resolvedMs - openedMs) / 60_000);
          if (minutes >= 0) {
            resolutionMinutes.push(minutes);
            if (minutes <= slaMinutes) withinSlaCount += 1;
          }
        }
      }
    }
  }

  const avgResolutionMinutes =
    resolutionMinutes.length > 0
      ? Math.round(
          resolutionMinutes.reduce((a, b) => a + b, 0) /
            resolutionMinutes.length
        )
      : null;

  const medianResolutionMinutes =
    resolutionMinutes.length > 0 ? median(resolutionMinutes) : null;

  const slaComplianceRate =
    resolved > 0 ? round4(withinSlaCount / resolved) : null;

  return {
    totalDisputes,
    open,
    resolved,
    avgResolutionMinutes,
    medianResolutionMinutes,
    withinSlaCount,
    slaComplianceRate,
    openBreakdown,
    slaMinutes,
  };
}

/** Median of a non-empty numeric array, rounded to the nearest integer. */
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Round to 4 decimals to keep the rate deterministic across environments. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
