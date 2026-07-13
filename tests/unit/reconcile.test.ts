import { describe, it, expect } from 'vitest';
import {
  reconcileMatchResult,
  type ReportSide,
  type EvidenceRef,
  type ReconcileInput,
} from '../../utils/matches/reconcile';

const NOW = '2026-07-13T12:00:00.000Z';
const DEADLINE = 60; // minutes

function report(
  teamSide: 1 | 2,
  team1Score: number,
  team2Score: number,
  reportedAt = NOW
): ReportSide {
  return { teamSide, team1Score, team2Score, reportedAt };
}

function evidence(
  teamSide: 1 | 2 | null,
  id = 'ev-1',
  kind: EvidenceRef['kind'] = 'screenshot'
): EvidenceRef {
  return { teamSide, kind, id };
}

function input(over: Partial<ReconcileInput>): ReconcileInput {
  return {
    reports: [],
    evidence: [],
    now: NOW,
    config: { opponentSilenceDeadlineMinutes: DEADLINE },
    ...over,
  };
}

/** ISO string `minutes` before NOW. */
function minutesAgo(minutes: number): string {
  return new Date(Date.parse(NOW) - minutes * 60_000).toISOString();
}

describe('reconcileMatchResult — rule 1: no reports', () => {
  it('returns awaiting_reports when there are 0 reports', () => {
    const res = reconcileMatchResult(input({ reports: [] }));
    expect(res).toEqual({ outcome: 'awaiting_reports' });
  });
});

describe('reconcileMatchResult — rule 2: one report within window', () => {
  it('returns awaiting_opponent when a single fresh report exists', () => {
    const res = reconcileMatchResult(
      input({ reports: [report(1, 2, 1, minutesAgo(10))] })
    );
    expect(res).toEqual({ outcome: 'awaiting_opponent', reportedSide: 1 });
  });

  it('carries the reporting side (side 2)', () => {
    const res = reconcileMatchResult(
      input({ reports: [report(2, 0, 2, minutesAgo(1))] })
    );
    expect(res).toEqual({ outcome: 'awaiting_opponent', reportedSide: 2 });
  });

  it('stays awaiting_opponent even when reporter has evidence, if before deadline', () => {
    const res = reconcileMatchResult(
      input({
        reports: [report(1, 2, 1, minutesAgo(30))],
        evidence: [evidence(1)],
      })
    );
    expect(res).toEqual({ outcome: 'awaiting_opponent', reportedSide: 1 });
  });

  it('treats an unparseable reportedAt as unknown age → awaiting_opponent', () => {
    const res = reconcileMatchResult(
      input({ reports: [report(1, 2, 1, 'not-a-date')] })
    );
    expect(res).toEqual({ outcome: 'awaiting_opponent', reportedSide: 1 });
  });
});

describe('reconcileMatchResult — rule 3: one report past deadline WITH evidence', () => {
  it('auto_resolves with the reporter score + reason', () => {
    const res = reconcileMatchResult(
      input({
        reports: [report(1, 2, 0, minutesAgo(90))],
        evidence: [evidence(1, 'shot-1', 'screenshot')],
      })
    );
    expect(res).toEqual({
      outcome: 'auto_resolved',
      team1Score: 2,
      team2Score: 0,
      reason: 'Adversaire silencieux au-delà du délai + preuve fournie',
    });
  });

  it('auto_resolves for side 2 with its canonical scores', () => {
    const res = reconcileMatchResult(
      input({
        reports: [report(2, 1, 3, minutesAgo(120))],
        evidence: [evidence(2, 'replay-1', 'replay_file')],
      })
    );
    expect(res).toMatchObject({
      outcome: 'auto_resolved',
      team1Score: 1,
      team2Score: 3,
    });
  });

  it('boundary: age EXACTLY at deadline counts as past → auto_resolved', () => {
    const res = reconcileMatchResult(
      input({
        reports: [report(1, 2, 1, minutesAgo(DEADLINE))],
        evidence: [evidence(1)],
      })
    );
    expect(res).toMatchObject({ outcome: 'auto_resolved' });
  });

  it('does NOT auto_resolve on the opponent-side evidence only', () => {
    // Reporter is side 1 but the only evidence is attributed to side 2.
    const res = reconcileMatchResult(
      input({
        reports: [report(1, 2, 0, minutesAgo(90))],
        evidence: [evidence(2)],
      })
    );
    expect(res).toMatchObject({ outcome: 'needs_arbitration' });
  });

  it('does NOT count unattributed (null-side) evidence toward the reporter', () => {
    const res = reconcileMatchResult(
      input({
        reports: [report(1, 2, 0, minutesAgo(90))],
        evidence: [evidence(null)],
      })
    );
    expect(res).toMatchObject({ outcome: 'needs_arbitration' });
  });
});

describe('reconcileMatchResult — rule 4: one report past deadline WITHOUT evidence', () => {
  it('needs_arbitration with opponent_silent_no_evidence conflict', () => {
    const res = reconcileMatchResult(
      input({ reports: [report(1, 2, 0, minutesAgo(75))] })
    );
    expect(res).toEqual({
      outcome: 'needs_arbitration',
      conflict: {
        kind: 'opponent_silent_no_evidence',
        reportedSide: 1,
        reported: { team1Score: 2, team2Score: 0 },
      },
      evidenceBundle: [],
    });
  });

  it('bundles unattributed evidence even though it did not unlock auto-resolve', () => {
    const ev = evidence(null, 'staff-note');
    const res = reconcileMatchResult(
      input({ reports: [report(2, 0, 1, minutesAgo(75))], evidence: [ev] })
    );
    expect(res).toMatchObject({
      outcome: 'needs_arbitration',
      conflict: { kind: 'opponent_silent_no_evidence', reportedSide: 2 },
      evidenceBundle: [ev],
    });
  });
});

describe('reconcileMatchResult — rule 5: two reports', () => {
  it('agreed when both report identical canonical scores', () => {
    const res = reconcileMatchResult(
      input({ reports: [report(1, 2, 1), report(2, 2, 1)] })
    );
    expect(res).toEqual({ outcome: 'agreed', team1Score: 2, team2Score: 1 });
  });

  it('agreed regardless of report order', () => {
    const res = reconcileMatchResult(
      input({ reports: [report(2, 0, 3), report(1, 0, 3)] })
    );
    expect(res).toEqual({ outcome: 'agreed', team1Score: 0, team2Score: 3 });
  });

  it('agreed and ignores evidence when the reports match', () => {
    const res = reconcileMatchResult(
      input({
        reports: [report(1, 3, 2), report(2, 3, 2)],
        evidence: [evidence(1), evidence(2)],
      })
    );
    expect(res).toEqual({ outcome: 'agreed', team1Score: 3, team2Score: 2 });
  });

  it('canonical orientation: NOT flipped by side — mirrored scores disagree', () => {
    // Both sides report from the MATCH POV. If side 2 reported from its own POV
    // it would submit (1,2); that is a genuine disagreement, not agreement.
    const res = reconcileMatchResult(
      input({ reports: [report(1, 2, 1), report(2, 1, 2)] })
    );
    expect(res).toMatchObject({ outcome: 'needs_arbitration' });
  });

  it('needs_arbitration on genuine disagreement, with full conflict shape', () => {
    const res = reconcileMatchResult(
      input({ reports: [report(1, 2, 1), report(2, 1, 2)] })
    );
    expect(res).toEqual({
      outcome: 'needs_arbitration',
      conflict: {
        kind: 'captain_disagreement',
        side1: { team1Score: 2, team2Score: 1 },
        side2: { team1Score: 1, team2Score: 2 },
      },
      evidenceBundle: [],
    });
  });

  it('pre-attaches ALL evidence to the arbitration bundle on disagreement', () => {
    const evs = [evidence(1, 'a'), evidence(2, 'b'), evidence(null, 'c')];
    const res = reconcileMatchResult(
      input({ reports: [report(1, 2, 0), report(2, 0, 2)], evidence: evs })
    );
    expect(res).toMatchObject({
      outcome: 'needs_arbitration',
      conflict: { kind: 'captain_disagreement' },
      evidenceBundle: evs,
    });
  });

  it('partial disagreement (only team2 differs) → needs_arbitration', () => {
    const res = reconcileMatchResult(
      input({ reports: [report(1, 2, 1), report(2, 2, 0)] })
    );
    expect(res).toMatchObject({
      outcome: 'needs_arbitration',
      conflict: {
        kind: 'captain_disagreement',
        side1: { team1Score: 2, team2Score: 1 },
        side2: { team1Score: 2, team2Score: 0 },
      },
    });
  });
});
