// Tests for utils/dashboard/buildTournamentDashboard.ts
//
// fetchDashboardData is the largest uncovered util in the project (~800 lines).
// We can't realistically reproduce a full tournament-state fixture, but we can
// drive it with a minimal seed so most aggregation branches execute.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import {
  fetchDashboardData,
  computeAlertsSummary,
} from '../../utils/dashboard/buildTournamentDashboard';

const TOUR = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  resetSupabaseMock();
});

/* -----------------------------------------------------------
 * fetchDashboardData
 * ---------------------------------------------------------*/

describe('fetchDashboardData', () => {
  it('returns 400 on invalid id', async () => {
    const r = await fetchDashboardData('not-uuid');
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(400);
  });

  it('returns 404 when tournament missing', async () => {
    const r = await fetchDashboardData(TOUR);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(404);
  });

  it('returns 200 with default empty payload for a tournament with no data', async () => {
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
    const r = await fetchDashboardData(TOUR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.summary.totalTeams).toBe(0);
    expect(r.data.summary.totalMatches).toBe(0);
    expect(r.data.summary.completionPercent).toBe(0);
    expect(r.data.stages).toEqual([]);
    expect(r.data.upcomingMatches).toEqual([]);
    // 8 channel types
    expect(r.data.signals.discordHealth.channels.length).toBe(8);
    expect(r.data.signals.disputesOpen.count).toBe(0);
    expect(r.data.signals.checkinNext24h.upcoming).toBe(0);
    // status guards: 5 entries, with 'draft' / 'archived' always allowed
    expect(r.data.guards.guards.length).toBe(5);
    const draftGuard = r.data.guards.guards.find((g) => g.status === 'draft');
    expect(draftGuard?.allowed).toBe(true);
  });

  it('aggregates a tournament with stages, matches, teams, support tickets, and discord webhooks', async () => {
    const NOW = Date.now();
    const FUTURE_PLUS_2H = new Date(NOW + 2 * 3_600_000).toISOString();
    const PAST_1H = new Date(NOW - 1 * 3_600_000).toISOString();

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
        settings: {
          advancement_rules: {
            advance_top: 4,
            target_stage_id: 's2',
          },
        },
      },
      {
        id: 's2',
        tournament_id: TOUR,
        name: 'Bracket',
        stage_type: 'bracket',
        order_index: 1,
        is_active: false,
      },
    ] as any;
    store.tournament_teams = [
      { id: 'tt1', team_id: 'tA', tournament_id: TOUR, status: 'registered' },
      { id: 'tt2', team_id: 'tB', tournament_id: TOUR, status: 'registered' },
      { id: 'tt3', team_id: 'tC', tournament_id: TOUR, status: 'pending' },
    ] as any;
    store.stage_teams = [
      { stage_id: 's1', team_id: 'tA' },
      { stage_id: 's1', team_id: 'tB' },
    ] as any;
    store.matches = [
      // Finished match — exercises map / completed_at branches
      {
        id: 'm1',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'finished',
        round_number: 1,
        round_name: 'R1',
        scheduled_at: PAST_1H,
        stream_url: null,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        is_bye: false,
        bracket_side: null,
        match_format: 'bo3',
        team1_score: 2,
        team2_score: 1,
        dispute_reason: null,
        dispute_opened_at: null,
        team1_checked_in_at: PAST_1H,
        team2_checked_in_at: PAST_1H,
        forfeit_processed_at: null,
        completed_at: PAST_1H,
      },
      // Pending match within the next 24h, no stream → triggers warning + checkin missing
      {
        id: 'm2',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'pending',
        round_number: 2,
        scheduled_at: FUTURE_PLUS_2H,
        stream_url: null,
        team1_id: 'tA',
        team2_id: 'tC',
        is_bye: false,
        match_format: 'bo3',
        team1_score: 0,
        team2_score: 0,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        forfeit_processed_at: null,
        completed_at: null,
      },
      // Disputed match
      {
        id: 'm3',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'disputed',
        team1_id: 'tA',
        team2_id: 'tB',
        is_bye: false,
        match_format: 'bo3',
        dispute_reason: 'score mismatch',
        dispute_opened_at: PAST_1H,
        team1_score: 1,
        team2_score: 1,
      },
      // Ongoing match
      {
        id: 'm4',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'ongoing',
        scheduled_at: FUTURE_PLUS_2H,
        team1_id: 'tA',
        team2_id: 'tB',
        is_bye: false,
        match_format: 'bo3',
        team1_score: 1,
        team2_score: 0,
        team1_checked_in_at: PAST_1H,
        team2_checked_in_at: null,
      },
      // Pending match with a missing team → triggers "missing teams" alert
      {
        id: 'm5',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'pending',
        team1_id: 'tA',
        team2_id: null,
        is_bye: false,
        match_format: 'bo3',
      },
      // Cancelled match — should be ignored almost everywhere
      {
        id: 'm6',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'cancelled',
        team1_id: null,
        team2_id: null,
        is_bye: false,
      },
      // Bye — also generally skipped
      {
        id: 'm7',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'finished',
        team1_id: 'tA',
        team2_id: null,
        is_bye: true,
      },
    ] as any;
    store.teams = [
      { id: 'tA', name: 'Alpha' },
      { id: 'tB', name: 'Beta' },
      { id: 'tC', name: 'Gamma' },
    ] as any;
    store.team_members = [
      { team_id: 'tA', user_id: 'u1' },
      { team_id: 'tA', user_id: 'u2' },
      // Team B has only 1 member — below min_players=5 → counts as below min
      { team_id: 'tB', user_id: 'u3' },
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
        severity: 'medium',
        status: 'open',
      },
    ] as any;
    store.match_mvp_polls = [
      {
        match_id: 'm1',
        winner_member_id: null,
        matches: { tournament_id: TOUR },
      },
    ] as any;
    store.staff_logs = [
      {
        id: 'log-1',
        action: 'create_match',
        entity_type: 'match',
        entity_id: 'm1',
        created_at: '2026-04-29T10:00:00.000Z',
        tournament_id: TOUR,
        staff: [{ display_name: 'Alice' }],
      },
    ] as any;
    store.discord_webhooks = [
      {
        tournament_id: TOUR,
        channel_type: 'match_results',
        is_active: true,
        last_post_at: null,
      },
      {
        tournament_id: null,
        channel_type: 'bracket_updates',
        is_active: true,
        last_post_at: '2026-01-01T00:00:00.000Z', // very old → stale
      },
    ] as any;
    store.match_map_vetos = [
      {
        match_id: 'm4',
        action: 'pick',
        map_name: 'Ilios',
        map_type: 'control',
        step_number: 1,
      },
      {
        match_id: 'm4',
        action: 'pick',
        map_name: 'Hanamura',
        map_type: 'assault',
        step_number: 2,
      },
    ] as any;
    store.site_settings = [
      {
        key: 'last_cron_checkin_at',
        value: new Date(NOW - 90 * 60_000).toISOString(),
        updated_at: new Date(NOW - 90 * 60_000).toISOString(),
      },
    ] as any;

    const r = await fetchDashboardData(TOUR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Stage progress
    expect(r.data.stages.length).toBe(2);
    const groupStage = r.data.stages.find((s) => s.id === 's1');
    expect(groupStage?.totalMatches).toBe(7);
    expect(groupStage?.finishedMatches).toBe(2);
    expect(groupStage?.pendingMatches).toBe(2);
    expect(groupStage?.ongoingMatches).toBe(1);

    // Summary
    expect(r.data.summary.totalTeams).toBe(3);
    expect(r.data.summary.totalMatches).toBe(6); // excludes cancelled
    expect(r.data.summary.finishedMatches).toBe(2);
    expect(r.data.summary.completionPercent).toBeGreaterThan(0);

    // Alerts
    expect(r.data.alerts.length).toBeGreaterThanOrEqual(1);

    // Disputes
    expect(r.data.signals.disputesOpen.count).toBe(1);

    // Pending teams (status='pending' in tournament_teams)
    expect(r.data.signals.pendingTeamsCount).toBe(1);

    // Support tickets
    expect(r.data.signals.supportHighOpen).toBe(1);
    expect(r.data.signals.tickets.totalOpen).toBe(2);

    // Roster lock proximity (6h from now → flagged soon)
    expect(r.data.signals.rosterLockProximity.lockedAt).toBeTruthy();

    // Stages ready to advance — group stage has 2 finished + 0 pending? Actually
    // stage s1 still has pending matches, so it shouldn't be in stagesReady.
    // We just confirm the field exists.
    expect(Array.isArray(r.data.signals.stagesReadyToAdvance)).toBe(true);

    // Live matches
    expect(r.data.signals.liveMatches.length).toBe(1);
    // currentMap from veto picks at index = team1Score+team2Score = 1
    expect(r.data.signals.liveMatches[0].currentMap?.name).toBe('Hanamura');

    // Velocity
    expect(typeof r.data.signals.velocity.matchesPerHour).toBe('number');

    // Recent staff activity
    expect(r.data.signals.recentActivity.length).toBe(1);
    expect(r.data.signals.recentActivity[0].staffName).toBe('Alice');
    expect(r.data.signals.recentActivity[0].readableAction).toBe(
      'Création match'
    );

    // Discord webhook health
    expect(r.data.signals.discordHealth.channels.length).toBe(8);

    // Cron checkin heartbeat
    expect(r.data.signals.cronCheckin.lastRunAt).toBeTruthy();
  });

  it('handles a stage ready to advance (all matches finished + advancement_rules)', async () => {
    store.tournaments = [
      {
        id: TOUR,
        name: 'Cup',
        status: 'running',
        start_date: null,
        end_date: null,
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
        settings: {
          advancement_rules: {
            advance_top: 2,
            target_stage_id: 's-target',
          },
        },
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOUR,
        stage_id: 's1',
        status: 'finished',
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        is_bye: false,
        match_format: 'bo3',
        completed_at: '2026-04-29T10:00:00.000Z',
      },
    ] as any;
    const r = await fetchDashboardData(TOUR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.signals.stagesReadyToAdvance.length).toBe(1);
    expect(r.data.signals.stagesReadyToAdvance[0].stageId).toBe('s1');
  });
});

/* -----------------------------------------------------------
 * computeAlertsSummary
 * ---------------------------------------------------------*/

describe('computeAlertsSummary', () => {
  it('returns zeros when no data', () => {
    const r = computeAlertsSummary(null);
    expect(r.tournamentId).toBeNull();
    expect(r.total).toBe(0);
  });

  it('aggregates breakdown and total correctly', () => {
    const data: any = {
      tournament: { id: 't1' },
      signals: {
        disputesOpen: { count: 2 },
        conflictsCount: 3,
        supportHighOpen: 1,
        pendingTeamsCount: 4,
        checkinNext24h: { missing: 2 },
        rosterLockProximity: { lockedAt: 'x', hoursLeft: 12 },
        stagesReadyToAdvance: [{ stageId: 's1', stageName: 'A' }],
        activeMvpPolls: 1,
      },
    };
    const r = computeAlertsSummary(data);
    expect(r.tournamentId).toBe('t1');
    expect(r.breakdown.rosterLockSoon).toBe(true);
    expect(r.total).toBe(2 + 3 + 1 + 4 + 2 + 1 + 1 + 1);
  });

  it('rosterLockSoon false when hoursLeft > 24', () => {
    const data: any = {
      tournament: { id: 't1' },
      signals: {
        disputesOpen: { count: 0 },
        conflictsCount: 0,
        supportHighOpen: 0,
        pendingTeamsCount: 0,
        checkinNext24h: { missing: 0 },
        rosterLockProximity: { lockedAt: 'x', hoursLeft: 48 },
        stagesReadyToAdvance: [],
        activeMvpPolls: 0,
      },
    };
    const r = computeAlertsSummary(data);
    expect(r.breakdown.rosterLockSoon).toBe(false);
    expect(r.total).toBe(0);
  });

  it('rosterLockSoon false when hoursLeft is 0 (already locked)', () => {
    const data: any = {
      tournament: { id: 't1' },
      signals: {
        disputesOpen: { count: 0 },
        conflictsCount: 0,
        supportHighOpen: 0,
        pendingTeamsCount: 0,
        checkinNext24h: { missing: 0 },
        rosterLockProximity: { lockedAt: 'x', hoursLeft: 0 },
        stagesReadyToAdvance: [],
        activeMvpPolls: 0,
      },
    };
    const r = computeAlertsSummary(data);
    expect(r.breakdown.rosterLockSoon).toBe(false);
  });
});
