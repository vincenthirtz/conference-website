import { describe, it, expect, vi } from 'vitest';

// supabaseAdmin is referenced at module load by the dashboard util.
vi.mock('../../utils/supabase', () => ({ supabaseAdmin: {} }));

import {
  computeAlertsSummary,
  type DashboardData,
} from '../../utils/dashboard/buildTournamentDashboard';

function makeData(
  overrides: Partial<DashboardData['signals']> = {}
): DashboardData {
  return {
    tournament: {
      id: 't1',
      name: 'Test',
      status: 'running',
      start_date: null,
      end_date: null,
      timezone: null,
      format: null,
      min_players: null,
      roster_locked_at: null,
    },
    summary: {
      totalTeams: 0,
      totalMatches: 0,
      finishedMatches: 0,
      pendingMatches: 0,
      ongoingMatches: 0,
      completionPercent: 0,
      eliminatedTeams: 0,
      activeTeams: 0,
    },
    stages: [],
    upcomingMatches: [],
    alerts: [],
    signals: {
      disputesOpen: { count: 0, matches: [] },
      checkinNext24h: {
        upcoming: 0,
        bothCheckedIn: 0,
        oneSide: 0,
        missing: 0,
        forfeited: 0,
      },
      conflictsCount: 0,
      conflictsList: [],
      pendingTeamsCount: 0,
      rosterLockProximity: {
        lockedAt: null,
        hoursLeft: null,
        teamsBelowMin: 0,
      },
      supportHighOpen: 0,
      activeMvpPolls: 0,
      stagesReadyToAdvance: [],
      liveMatches: [],
      velocity: {
        matchesPerHour: 0,
        windowHours: 6,
        finishedInWindow: 0,
        remainingMatches: 0,
        etaIso: null,
      },
      recentActivity: [],
      ...overrides,
    },
    guards: { current_status: 'running', guards: [] },
    generatedAt: new Date().toISOString(),
  };
}

describe('computeAlertsSummary', () => {
  it('returns total=0 and null tournamentId when input is null', () => {
    const out = computeAlertsSummary(null);
    expect(out.total).toBe(0);
    expect(out.tournamentId).toBeNull();
    expect(out.breakdown.disputes).toBe(0);
    expect(out.breakdown.rosterLockSoon).toBe(false);
  });

  it('sums disputes, conflicts, support, pending teams, checkin missing, MVP, stages ready', () => {
    const data = makeData({
      disputesOpen: { count: 2, matches: [] },
      conflictsCount: 1,
      supportHighOpen: 3,
      pendingTeamsCount: 4,
      checkinNext24h: {
        upcoming: 10,
        bothCheckedIn: 5,
        oneSide: 0,
        missing: 5,
        forfeited: 0,
      },
      activeMvpPolls: 1,
      stagesReadyToAdvance: [
        { stageId: 's1', stageName: 'Phase 1' },
        { stageId: 's2', stageName: 'Phase 2' },
      ],
    });
    const out = computeAlertsSummary(data);
    expect(out.tournamentId).toBe('t1');
    // 2 + 1 + 3 + 4 + 5 + 0 (no roster lock) + 2 + 1 = 18
    expect(out.total).toBe(18);
    expect(out.breakdown).toMatchObject({
      disputes: 2,
      conflicts: 1,
      supportHigh: 3,
      pendingTeams: 4,
      checkinMissing: 5,
      stagesReady: 2,
      activeMvpPolls: 1,
      rosterLockSoon: false,
    });
  });

  it('flags roster lock soon when hoursLeft is within 24h window', () => {
    const data = makeData({
      rosterLockProximity: {
        lockedAt: '2026-01-01T00:00:00Z',
        hoursLeft: 12,
        teamsBelowMin: 0,
      },
    });
    const out = computeAlertsSummary(data);
    expect(out.breakdown.rosterLockSoon).toBe(true);
    expect(out.total).toBe(1);
  });

  it('does NOT flag roster lock when hoursLeft > 24', () => {
    const data = makeData({
      rosterLockProximity: {
        lockedAt: '2026-01-01T00:00:00Z',
        hoursLeft: 48,
        teamsBelowMin: 0,
      },
    });
    expect(computeAlertsSummary(data).breakdown.rosterLockSoon).toBe(false);
  });

  it('does NOT flag roster lock when hoursLeft is 0 (already passed)', () => {
    const data = makeData({
      rosterLockProximity: {
        lockedAt: '2026-01-01T00:00:00Z',
        hoursLeft: 0,
        teamsBelowMin: 0,
      },
    });
    expect(computeAlertsSummary(data).breakdown.rosterLockSoon).toBe(false);
  });

  it('treats lockedAt absent as no roster-lock alert', () => {
    const data = makeData({
      rosterLockProximity: {
        lockedAt: null,
        hoursLeft: 5,
        teamsBelowMin: 3,
      },
    });
    expect(computeAlertsSummary(data).breakdown.rosterLockSoon).toBe(false);
  });

  it('returns 0 total when no signals are firing', () => {
    expect(computeAlertsSummary(makeData()).total).toBe(0);
  });
});
