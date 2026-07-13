// utils/matches/reconcile.ts
//
// Pure reconciliation logic for captain score reports (feature "Integrite des
// resultats & anti-triche", slice 1 : preuve + reconciliation).
//
// This function takes the current state of a match's score reports + attached
// evidence and decides, deterministically, what should happen next. It performs
// NO I/O : no Supabase, no Discord, no clock read. `now` is injected so the
// branching around the "opponent silence" deadline is unit-testable (same
// posture as utils/disputes/slaBreaches.ts `classifyAge`).
//
// It replaces the ad-hoc branching currently inlined in
// pages/api/bot/v1/matches/[matchId]/report.ts. The API layer stays responsible
// for I/O (upsert the report, read both reports + evidence, then act on the
// outcome returned here : applyMatchScore / open dispute / respond 200).
//
// ── Score orientation (the classic footgun) ──────────────────────────────────
// Both captains report in ONE canonical orientation : (team1Score, team2Score)
// always refer to the MATCH's team1 and team2 — never the reporter's own POV.
// This mirrors the current handler, whose Zod body is { team1Score, team2Score }
// (absolute) and whose agreement check is a plain field-by-field equality
// (`a.team1_score === b.team1_score && a.team2_score === b.team2_score`). We
// replicate that predicate exactly here: two reports "agree" iff both scores are
// equal in this canonical orientation. There is NO flipping by side.

export type TeamSide = 1 | 2;

export type ReportSide = {
  teamSide: TeamSide;
  /** Score of the match's team1, canonical orientation (not reporter POV). */
  team1Score: number;
  /** Score of the match's team2, canonical orientation (not reporter POV). */
  team2Score: number;
  /** ISO timestamp at which this side submitted its report. */
  reportedAt: string;
};

export type EvidenceKind = 'screenshot' | 'replay_file' | 'replay_url';

export type EvidenceRef = {
  /** Side that attached the evidence, or null if unattributed (e.g. staff). */
  teamSide: TeamSide | null;
  kind: EvidenceKind;
  id: string;
};

export type ReconcileConfig = {
  /**
   * Minutes of opponent silence after a lone report past which the reporter can
   * win by default — but only if they backed their report with evidence.
   */
  opponentSilenceDeadlineMinutes: number;
};

export type ReconcileInput = {
  /** 0, 1 or 2 report rows (unique per side in the DB). */
  reports: ReportSide[];
  /** Evidence attached to the match so far. */
  evidence: EvidenceRef[];
  /** Injected clock (ISO). */
  now: string;
  config: ReconcileConfig;
};

/** Genuine disagreement between the two captains (both reported). */
export type CaptainDisagreementConflict = {
  kind: 'captain_disagreement';
  side1: { team1Score: number; team2Score: number } | null;
  side2: { team1Score: number; team2Score: number } | null;
};

/** Lone report past deadline but with no proof to substantiate an auto-award. */
export type OpponentSilentNoEvidenceConflict = {
  kind: 'opponent_silent_no_evidence';
  reportedSide: TeamSide;
  reported: { team1Score: number; team2Score: number };
};

export type ReconcileConflict =
  | CaptainDisagreementConflict
  | OpponentSilentNoEvidenceConflict;

export type ReconcileResult =
  | { outcome: 'awaiting_reports' }
  | { outcome: 'awaiting_opponent'; reportedSide: TeamSide }
  | { outcome: 'agreed'; team1Score: number; team2Score: number }
  | {
      outcome: 'auto_resolved';
      team1Score: number;
      team2Score: number;
      reason: string;
    }
  | {
      outcome: 'needs_arbitration';
      conflict: ReconcileConflict;
      evidenceBundle: EvidenceRef[];
    };

const AUTO_RESOLVE_REASON =
  'Adversaire silencieux au-delà du délai + preuve fournie';

/**
 * Minutes elapsed between `reportedAt` and `now`. Returns null on unparseable
 * input so callers treat "unknown age" conservatively (never auto-resolve).
 */
function minutesSince(reportedAt: string, now: string): number | null {
  const then = Date.parse(reportedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(nowMs)) return null;
  return (nowMs - then) / 60_000;
}

/** True iff the given side attached at least one evidence item. */
function sideHasEvidence(evidence: EvidenceRef[], side: TeamSide): boolean {
  return evidence.some((e) => e.teamSide === side);
}

/**
 * Canonical agreement predicate — exact field-by-field equality in the
 * (team1Score, team2Score) orientation. Replicates `reportsAgree` from
 * pages/api/bot/v1/matches/[matchId]/report.ts.
 */
function reportsAgree(a: ReportSide, b: ReportSide): boolean {
  return a.team1Score === b.team1Score && a.team2Score === b.team2Score;
}

/**
 * Decide the next state of a match from its current reports + evidence.
 * Pure & deterministic — see module header for the full rule set.
 */
export function reconcileMatchResult(input: ReconcileInput): ReconcileResult {
  const { reports, evidence, now, config } = input;

  // Rule 1 — no reports yet.
  if (reports.length === 0) {
    return { outcome: 'awaiting_reports' };
  }

  // Exactly one report → opponent-silence branch.
  if (reports.length === 1) {
    const [only] = reports;
    const age = minutesSince(only.reportedAt, now);
    const deadline = config.opponentSilenceDeadlineMinutes;

    // Rule 2 — still inside the window (or age unknown) → keep waiting.
    // Boundary: age === deadline is PAST the window (>=), so it falls through.
    if (age === null || age < deadline) {
      return { outcome: 'awaiting_opponent', reportedSide: only.teamSide };
    }

    // Past deadline. Rule 3 — reporter substantiated with proof → auto-award.
    if (sideHasEvidence(evidence, only.teamSide)) {
      return {
        outcome: 'auto_resolved',
        team1Score: only.team1Score,
        team2Score: only.team2Score,
        reason: AUTO_RESOLVE_REASON,
      };
    }

    // Rule 4 — silence alone, no proof → let staff arbitrate.
    return {
      outcome: 'needs_arbitration',
      conflict: {
        kind: 'opponent_silent_no_evidence',
        reportedSide: only.teamSide,
        reported: {
          team1Score: only.team1Score,
          team2Score: only.team2Score,
        },
      },
      evidenceBundle: evidence,
    };
  }

  // Rule 5 — two reports. Take the first row for each side (DB guarantees one
  // row per side; be defensive if fed duplicates).
  const side1 = reports.find((r) => r.teamSide === 1) ?? null;
  const side2 = reports.find((r) => r.teamSide === 2) ?? null;

  if (side1 && side2 && reportsAgree(side1, side2)) {
    return {
      outcome: 'agreed',
      team1Score: side1.team1Score,
      team2Score: side1.team2Score,
    };
  }

  // Genuine disagreement → open dispute with all evidence pre-attached.
  return {
    outcome: 'needs_arbitration',
    conflict: {
      kind: 'captain_disagreement',
      side1: side1
        ? { team1Score: side1.team1Score, team2Score: side1.team2Score }
        : null,
      side2: side2
        ? { team1Score: side2.team1Score, team2Score: side2.team2Score }
        : null,
    },
    evidenceBundle: evidence,
  };
}
