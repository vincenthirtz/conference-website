// Parity test: the LIGHT alerts path (fetchAlertsSignals) must produce a
// strictly identical AlertsSummary to the HEAVY dashboard builder path
// (computeAlertsSummary(fetchDashboardData(...).data)).
//
// Both run against the same in-memory Supabase mock, so if they diverge on any
// of the 8 breakdown fields or the total, this test fails. This is the safety
// net that lets the navbar badge use the cheap 6-query path instead of the
// ~18-query builder without ever drifting from the dashboard's numbers.

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import {
  fetchDashboardData,
  computeAlertsSummary,
  summarizeAlerts,
  type AlertsSummary,
} from '../../utils/dashboard/buildTournamentDashboard';
import { fetchAlertsSignals } from '../../utils/dashboard/alertsSignals';

const TOUR = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  resetSupabaseMock();
});

/** Run both code paths and return {heavy, light} AlertsSummary for comparison. */
async function bothPaths(): Promise<{
  heavy: AlertsSummary;
  light: AlertsSummary;
}> {
  const full = await fetchDashboardData(TOUR);
  expect(full.ok).toBe(true);
  if (!full.ok) throw new Error('builder failed');
  const heavy = computeAlertsSummary(full.data);

  const res = await fetchAlertsSignals(TOUR);
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('light path failed');
  return { heavy, light: res.summary };
}

describe('alerts summary parity: light path vs dashboard builder', () => {
  it('null input: summarizeAlerts(null) === computeAlertsSummary(null)', () => {
    expect(summarizeAlerts(null)).toEqual(computeAlertsSummary(null));
    expect(summarizeAlerts(null).total).toBe(0);
    expect(summarizeAlerts(null).tournamentId).toBeNull();
  });

  it('empty tournament (draft, no data): both paths return total=0', async () => {
    store.tournaments = [
      {
        id: TOUR,
        name: 'Empty Cup',
        status: 'draft',
        start_date: null,
        end_date: null,
        timezone: 'Europe/Paris',
        format: 'bo3',
        min_players: null,
        roster_locked_at: null,
      },
    ] as any;

    const { heavy, light } = await bothPaths();
    expect(light).toEqual(heavy);
    expect(light.total).toBe(0);
    expect(light.tournamentId).toBe(TOUR);
  });

  it('all 8 signals firing: light path matches builder exactly', async () => {
    const NOW = Date.now();
    const FUTURE_2H = new Date(NOW + 2 * 3_600_000).toISOString();
    const FUTURE_2H_20 = new Date(
      NOW + 2 * 3_600_000 + 20 * 60_000
    ).toISOString();

    store.tournaments = [
      {
        id: TOUR,
        name: 'Live Cup',
        status: 'running',
        start_date: '2026-04-01',
        end_date: '2026-05-01',
        timezone: 'Europe/Paris',
        format: 'bo3',
        min_players: 5,
        // 6h out → rosterLockSoon = true (0 < hoursLeft <= 24)
        roster_locked_at: new Date(NOW + 6 * 3_600_000).toISOString(),
      },
    ] as any;
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: TOUR,
        name: 'Group',
        stage_type: 'group',
        order_index: 0,
        is_active: true,
        // Not all matches finished → NOT ready
        settings: {
          advancement_rules: { advance_top: 4, target_stage_id: 's2' },
        },
      },
      {
        id: 's2',
        tournament_id: TOUR,
        name: 'Bracket',
        stage_type: 'bracket',
        order_index: 1,
        is_active: true,
        // single finished match + valid rules → READY to advance
        settings: {
          advancement_rules: { advance_top: 2, target_stage_id: 's3' },
        },
      },
    ] as any;
    store.tournament_teams = [
      { id: 'tt1', team_id: 'tA', tournament_id: TOUR, status: 'registered' },
      { id: 'tt2', team_id: 'tB', tournament_id: TOUR, status: 'registered' },
      // pending registration → pendingTeams = 1
      { id: 'tt3', team_id: 'tC', tournament_id: TOUR, status: 'pending' },
    ] as any;
    store.matches = [
      // Conflict pair for team tA (overlapping schedules), both in checkin
      // window with no check-ins → 1 conflict + 2 checkin-missing.
      {
        id: 'm1',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'pending',
        scheduled_at: FUTURE_2H,
        team1_id: 'tA',
        team2_id: 'tB',
        is_bye: false,
        match_format: 'bo3',
        team1_score: 0,
        team2_score: 0,
        forfeit_processed_at: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        completed_at: null,
      },
      {
        id: 'm2',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'pending',
        scheduled_at: FUTURE_2H_20,
        team1_id: 'tA',
        team2_id: 'tC',
        is_bye: false,
        match_format: 'bo3',
        team1_score: 0,
        team2_score: 0,
        forfeit_processed_at: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        completed_at: null,
      },
      // Disputed match → disputes = 1 (no schedule → not in checkin window)
      {
        id: 'm3',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'disputed',
        scheduled_at: null,
        team1_id: 'tA',
        team2_id: 'tB',
        is_bye: false,
        match_format: 'bo3',
        dispute_reason: 'score mismatch',
        dispute_opened_at: null,
      },
      // Finished match in s2 (no schedule) → makes s2 ready to advance.
      {
        id: 'm4',
        tournament_id: TOUR,
        stage_id: 's2',
        status: 'finished',
        scheduled_at: null,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        is_bye: false,
        match_format: 'bo3',
        completed_at: new Date(NOW - 3_600_000).toISOString(),
      },
    ] as any;
    store.teams = [
      { id: 'tA', name: 'Alpha' },
      { id: 'tB', name: 'Beta' },
      { id: 'tC', name: 'Gamma' },
    ] as any;
    store.support_tickets = [
      {
        tournament_id: TOUR,
        category: 'dispute',
        severity: 'high',
        status: 'open',
      },
      {
        tournament_id: TOUR,
        category: 'technical',
        severity: 'low',
        status: 'open',
      },
    ] as any;
    // Flat join key so the mock's `.eq('matches.tournament_id', ...)` matches
    // (the mock cannot resolve nested embeds). Both paths issue the identical
    // query, so whatever it resolves to, parity holds.
    store.match_mvp_polls = [
      {
        match_id: 'm4',
        winner_member_id: null,
        'matches.tournament_id': TOUR,
      },
    ] as any;

    const { heavy, light } = await bothPaths();
    expect(light).toEqual(heavy);

    // Spot-check the individual signals actually fired (guards against a
    // "both return zero" false-positive parity).
    expect(light.breakdown.disputes).toBe(1);
    expect(light.breakdown.conflicts).toBe(1);
    expect(light.breakdown.checkinMissing).toBe(2);
    expect(light.breakdown.pendingTeams).toBe(1);
    expect(light.breakdown.supportHigh).toBe(1);
    expect(light.breakdown.stagesReady).toBe(1);
    expect(light.breakdown.activeMvpPolls).toBe(1);
    expect(light.breakdown.rosterLockSoon).toBe(true);
    expect(light.total).toBe(1 + 1 + 2 + 1 + 1 + 1 + 1 + 1);
  });

  it('roster lock > 24h is NOT flagged soon in either path', async () => {
    const NOW = Date.now();
    store.tournaments = [
      {
        id: TOUR,
        name: 'Cup',
        status: 'running',
        start_date: null,
        end_date: null,
        timezone: null,
        format: 'bo3',
        min_players: 5,
        // 48h out → rosterLockSoon false
        roster_locked_at: new Date(NOW + 48 * 3_600_000).toISOString(),
      },
    ] as any;
    store.support_tickets = [
      {
        tournament_id: TOUR,
        category: 'dispute',
        severity: 'high',
        status: 'open',
      },
    ] as any;

    const { heavy, light } = await bothPaths();
    expect(light).toEqual(heavy);
    expect(light.breakdown.rosterLockSoon).toBe(false);
    expect(light.breakdown.supportHigh).toBe(1);
    expect(light.total).toBe(1);
  });

  it('roster lock already passed (hoursLeft = 0) is NOT flagged in either path', async () => {
    const NOW = Date.now();
    store.tournaments = [
      {
        id: TOUR,
        name: 'Cup',
        status: 'running',
        start_date: null,
        end_date: null,
        timezone: null,
        format: 'bo3',
        min_players: null,
        roster_locked_at: new Date(NOW - 3_600_000).toISOString(),
      },
    ] as any;

    const { heavy, light } = await bothPaths();
    expect(light).toEqual(heavy);
    expect(light.breakdown.rosterLockSoon).toBe(false);
    expect(light.total).toBe(0);
  });

  it('missing tournament: light path returns 404 like the builder', async () => {
    const res = await fetchAlertsSignals(TOUR);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);

    const full = await fetchDashboardData(TOUR);
    expect(full.ok).toBe(false);
    if (full.ok) return;
    expect(full.status).toBe(404);
  });

  it('invalid id: light path returns 400', async () => {
    const res = await fetchAlertsSignals('not-a-uuid');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });
});
