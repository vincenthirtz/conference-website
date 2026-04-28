// pages/api/admin/tournament/[id]/dashboard.ts
// GET : retourne une vue synthetique de la progression du tournoi.
// Matchs joues/restants, equipes eliminees, prochains matchs, alertes.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';

type StageProgress = {
  id: string;
  name: string;
  stage_type: string | null;
  order_index: number | null;
  is_active: boolean;
  totalMatches: number;
  finishedMatches: number;
  pendingMatches: number;
  ongoingMatches: number;
  cancelledMatches: number;
  teamsCount: number;
};

type UpcomingMatch = {
  id: string;
  stage_id: string | null;
  stage_name: string | null;
  round_number: number | null;
  round_name: string | null;
  scheduled_at: string | null;
  team1_name: string | null;
  team2_name: string | null;
  stream_url: string | null;
};

type Alert = {
  type: 'warning' | 'info' | 'error';
  message: string;
};

type DisputedMatch = {
  id: string;
  team1Name: string | null;
  team2Name: string | null;
  reason: string | null;
  openedAt: string | null;
};

type LiveMatch = {
  id: string;
  team1Name: string | null;
  team2Name: string | null;
  team1Score: number | null;
  team2Score: number | null;
  streamUrl: string | null;
  scheduledAt: string | null;
  roundName: string | null;
  stageName: string | null;
};

type StageReady = { stageId: string; stageName: string };

type StatusGuard = {
  status: string;
  label: string;
  allowed: boolean;
  reason?: string;
};

type DashboardSignals = {
  disputesOpen: { count: number; matches: DisputedMatch[] };
  checkinNext24h: {
    upcoming: number;
    bothCheckedIn: number;
    oneSide: number;
    missing: number;
    forfeited: number;
  };
  conflictsCount: number;
  pendingTeamsCount: number;
  rosterLockProximity: {
    lockedAt: string | null;
    hoursLeft: number | null;
    teamsBelowMin: number;
  };
  supportHighOpen: number;
  activeMvpPolls: number;
  stagesReadyToAdvance: StageReady[];
  liveMatches: LiveMatch[];
};

type DashboardData = {
  tournament: {
    id: string;
    name: string;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    timezone: string | null;
    format: string | null;
    min_players: number | null;
    roster_locked_at: string | null;
  };
  summary: {
    totalTeams: number;
    totalMatches: number;
    finishedMatches: number;
    pendingMatches: number;
    ongoingMatches: number;
    completionPercent: number;
    eliminatedTeams: number;
    activeTeams: number;
  };
  stages: StageProgress[];
  upcomingMatches: UpcomingMatch[];
  alerts: Alert[];
  signals: DashboardSignals;
  guards: { current_status: string; guards: StatusGuard[] };
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  running: 'En cours',
  completed: 'Terminé',
  archived: 'Archivé',
};

const MATCH_DURATION_MIN: Record<string, number> = {
  bo1: 20,
  bo2: 30,
  bo3: 45,
  bo5: 70,
  bo7: 95,
};

type ApiResponse = DashboardData | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const tournamentId = String(id);

  try {
    // Fetch tournament (extended: format / min_players / roster_locked_at for the new signals)
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select(
        'id, name, status, start_date, end_date, timezone, format, min_players, roster_locked_at'
      )
      .eq('id', tournamentId)
      .maybeSingle();

    if (tErr || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Fetch stages
    const { data: stagesData } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, name, stage_type, order_index, is_active')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    const stages = stagesData || [];

    // Fetch all matches (extended: scores, dispute, format, check-in timestamps)
    const { data: matchesData } = await supabaseAdmin
      .from('matches')
      .select(
        `id, stage_id, status, round_number, round_name, scheduled_at, stream_url,
         team1_id, team2_id, winner_team_id, is_bye, bracket_side,
         match_format, team1_score, team2_score,
         dispute_reason, dispute_opened_at,
         team1_checked_in_at, team2_checked_in_at, forfeit_processed_at`
      )
      .eq('tournament_id', tournamentId);

    const matches = matchesData || [];

    // Fetch tournament teams
    const { data: tournamentTeamsData } = await supabaseAdmin
      .from('tournament_teams')
      .select('team_id, status')
      .eq('tournament_id', tournamentId);

    const tournamentTeams = tournamentTeamsData || [];

    // Fetch stage teams counts in a single query instead of N+1
    const stageTeamCounts = new Map<string, number>();
    if (stages.length > 0) {
      const stageIds = stages.map((s) => s.id);
      const { data: stageTeamsData } = await supabaseAdmin
        .from('stage_teams')
        .select('stage_id')
        .in('stage_id', stageIds);

      for (const row of stageTeamsData || []) {
        stageTeamCounts.set(
          row.stage_id,
          (stageTeamCounts.get(row.stage_id) ?? 0) + 1
        );
      }
    }

    // Build stage progress
    const stageProgress: StageProgress[] = stages.map((s) => {
      const stageMatches = matches.filter((m) => m.stage_id === s.id);
      return {
        id: s.id,
        name: s.name,
        stage_type: s.stage_type,
        order_index: s.order_index,
        is_active: s.is_active,
        totalMatches: stageMatches.length,
        finishedMatches: stageMatches.filter((m) => m.status === 'finished')
          .length,
        pendingMatches: stageMatches.filter((m) => m.status === 'pending')
          .length,
        ongoingMatches: stageMatches.filter((m) => m.status === 'ongoing')
          .length,
        cancelledMatches: stageMatches.filter((m) => m.status === 'cancelled')
          .length,
        teamsCount: stageTeamCounts.get(s.id) ?? 0,
      };
    });

    // Summary
    const totalMatches = matches.filter((m) => m.status !== 'cancelled').length;
    const finishedMatches = matches.filter(
      (m) => m.status === 'finished'
    ).length;
    const pendingMatches = matches.filter((m) => m.status === 'pending').length;
    const ongoingMatches = matches.filter((m) => m.status === 'ongoing').length;

    // Eliminated teams: teams that lost in bracket matches (have a loss and no upcoming matches)
    const teamsWithLoss = new Set<string>();
    const teamsWithUpcoming = new Set<string>();

    for (const m of matches) {
      if (m.status === 'finished' && m.winner_team_id && !m.is_bye) {
        const loserId =
          m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id;
        if (loserId) teamsWithLoss.add(loserId);
      }
      if (m.status === 'pending' || m.status === 'ongoing') {
        if (m.team1_id) teamsWithUpcoming.add(m.team1_id);
        if (m.team2_id) teamsWithUpcoming.add(m.team2_id);
      }
    }

    // Eliminated = lost and no upcoming matches
    const eliminatedTeams = new Set<string>();
    for (const teamId of teamsWithLoss) {
      if (!teamsWithUpcoming.has(teamId)) {
        eliminatedTeams.add(teamId);
      }
    }

    const totalTeams = tournamentTeams.length;
    const activeTeams = totalTeams - eliminatedTeams.size;

    // Upcoming matches (next 10 pending/ongoing, sorted by scheduled_at)
    const upcoming = matches
      .filter((m) => m.status === 'pending' || m.status === 'ongoing')
      .sort((a, b) => {
        if (!a.scheduled_at && !b.scheduled_at) return 0;
        if (!a.scheduled_at) return 1;
        if (!b.scheduled_at) return -1;
        return (
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime()
        );
      })
      .slice(0, 10);

    // Fetch team names for upcoming matches
    const teamIds = new Set<string>();
    for (const m of upcoming) {
      if (m.team1_id) teamIds.add(m.team1_id);
      if (m.team2_id) teamIds.add(m.team2_id);
    }

    const teamNameMap = new Map<string, string>();
    if (teamIds.size > 0) {
      const { data: teamsData } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .in('id', Array.from(teamIds));

      for (const t of teamsData || []) {
        teamNameMap.set(t.id, t.name);
      }
    }

    const stageNameMap = new Map<string, string>();
    for (const s of stages) {
      stageNameMap.set(s.id, s.name);
    }

    const upcomingMatches: UpcomingMatch[] = upcoming.map((m) => ({
      id: m.id,
      stage_id: m.stage_id,
      stage_name: m.stage_id ? (stageNameMap.get(m.stage_id) ?? null) : null,
      round_number: m.round_number,
      round_name: m.round_name,
      scheduled_at: m.scheduled_at,
      team1_name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
      team2_name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
      stream_url: m.stream_url,
    }));

    // Alerts
    const alerts: Alert[] = [];

    // Matches without stream
    const noStreamCount = matches.filter(
      (m) =>
        (m.status === 'pending' || m.status === 'ongoing') &&
        !m.stream_url &&
        !m.is_bye
    ).length;
    if (noStreamCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${noStreamCount} match(s) a venir sans stream attribue.`,
      });
    }

    // Matches with missing teams
    const missingTeamsCount = matches.filter(
      (m) => m.status === 'pending' && !m.is_bye && (!m.team1_id || !m.team2_id)
    ).length;
    if (missingTeamsCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${missingTeamsCount} match(s) en attente sans equipe(s) assignee(s).`,
      });
    }

    // Overdue matches (scheduled in the past but still pending)
    const now = new Date();
    const overdueCount = matches.filter(
      (m) =>
        m.status === 'pending' &&
        m.scheduled_at &&
        new Date(m.scheduled_at) < now
    ).length;
    if (overdueCount > 0) {
      alerts.push({
        type: 'error',
        message: `${overdueCount} match(s) en retard (heure programmee depassee).`,
      });
    }

    // Inactive stages with pending matches
    for (const sp of stageProgress) {
      if (!sp.is_active && sp.pendingMatches > 0) {
        alerts.push({
          type: 'info',
          message: `Stage "${sp.name}" est inactive mais contient ${sp.pendingMatches} match(s) en attente.`,
        });
      }
    }

    // Completion
    const completionPercent =
      totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

    /* =====================================================================
     * NOUVEAUX SIGNAUX (calculés en parallèle pour rester sous ~800ms)
     * =====================================================================*/

    const NOW_MS = Date.now();
    const NEXT_24H_ISO = new Date(NOW_MS + 24 * 60 * 60 * 1000).toISOString();

    const [
      pendingTeamsCountRes,
      supportHighRes,
      activeMvpPollsRes,
      teamMembersCountRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('tournament_teams')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('status', 'pending'),
      supabaseAdmin
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('severity', 'high')
        .eq('status', 'open'),
      // Active MVP polls: row exists with no winner imported yet, for matches of this tournament.
      supabaseAdmin
        .from('match_mvp_polls')
        .select('match_id, matches!inner(tournament_id)')
        .is('winner_member_id', null)
        .eq('matches.tournament_id', tournamentId),
      // For roster_locked_at proximity: count teams with member_count < min_players
      tournament.min_players && tournament.roster_locked_at
        ? supabaseAdmin
            .from('team_members')
            .select('team_id, tournament_teams!inner(tournament_id)')
            .eq('tournament_teams.tournament_id', tournamentId)
        : Promise.resolve({ data: null }),
    ]);

    // 1) Disputes ouvertes — extraites des matches déjà fetchés
    const disputedRows = matches.filter((m) => m.status === 'disputed');
    const disputedTeamIdsSet = new Set<string>();
    for (const m of disputedRows) {
      if (m.team1_id) disputedTeamIdsSet.add(m.team1_id);
      if (m.team2_id) disputedTeamIdsSet.add(m.team2_id);
    }
    // Reuse teamNameMap if present, else complete it
    if (disputedTeamIdsSet.size > 0) {
      const missing = Array.from(disputedTeamIdsSet).filter(
        (id) => !teamNameMap.has(id)
      );
      if (missing.length > 0) {
        const { data: extra } = await supabaseAdmin
          .from('teams')
          .select('id, name')
          .in('id', missing);
        for (const t of extra || []) teamNameMap.set(t.id, t.name);
      }
    }
    const disputedMatches: DisputedMatch[] = disputedRows
      .slice(0, 10)
      .map((m) => ({
        id: m.id,
        team1Name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
        team2Name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
        reason: m.dispute_reason ?? null,
        openedAt: m.dispute_opened_at ?? null,
      }));

    // 2) Live matches — status='ongoing' (the dashboard already excludes cancelled)
    const liveMatchesRows = matches.filter((m) => m.status === 'ongoing');
    const liveMatches: LiveMatch[] = liveMatchesRows.map((m) => ({
      id: m.id,
      team1Name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
      team2Name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
      team1Score: m.team1_score ?? null,
      team2Score: m.team2_score ?? null,
      streamUrl: m.stream_url ?? null,
      scheduledAt: m.scheduled_at ?? null,
      roundName: m.round_name ?? null,
      stageName: m.stage_id ? (stageNameMap.get(m.stage_id) ?? null) : null,
    }));

    // 3) Check-in next 24h — derived from matches we already have
    const checkin24h = {
      upcoming: 0,
      bothCheckedIn: 0,
      oneSide: 0,
      missing: 0,
      forfeited: 0,
    };
    for (const m of matches) {
      if (m.is_bye) continue;
      if (!m.scheduled_at) continue;
      const at = new Date(m.scheduled_at).getTime();
      if (at < NOW_MS - 30 * 60_000) continue; // already past (>30min ago)
      if (at > NOW_MS + 24 * 60 * 60_000) continue;
      if (m.status === 'cancelled') continue;
      checkin24h.upcoming++;
      if (m.forfeit_processed_at) {
        checkin24h.forfeited++;
        continue;
      }
      const t1 = !!m.team1_checked_in_at;
      const t2 = !!m.team2_checked_in_at;
      if (t1 && t2) checkin24h.bothCheckedIn++;
      else if (t1 || t2) checkin24h.oneSide++;
      else checkin24h.missing++;
    }

    // 4) Conflits de planning — overlap inline (cheap) sur les matches scheduled non-cancelled non-bye
    const teamMatchSlots = new Map<
      string,
      { id: string; start: number; end: number }[]
    >();
    for (const m of matches) {
      if (m.is_bye || m.status === 'cancelled' || !m.scheduled_at) continue;
      const fmt = (m.match_format || 'bo3') as string;
      const dur = MATCH_DURATION_MIN[fmt] ?? 45;
      const start = new Date(m.scheduled_at).getTime();
      const end = start + dur * 60_000;
      for (const tid of [m.team1_id, m.team2_id]) {
        if (!tid) continue;
        const arr = teamMatchSlots.get(tid) ?? [];
        arr.push({ id: m.id, start, end });
        teamMatchSlots.set(tid, arr);
      }
    }
    let conflictsCount = 0;
    for (const slots of teamMatchSlots.values()) {
      slots.sort((a, b) => a.start - b.start);
      for (let i = 0; i < slots.length - 1; i++) {
        if (slots[i].end > slots[i + 1].start) conflictsCount++;
      }
    }

    // 5) Roster lock proximity
    const lockedAtIso = tournament.roster_locked_at ?? null;
    let rosterLockProximity: DashboardSignals['rosterLockProximity'] = {
      lockedAt: lockedAtIso,
      hoursLeft: null,
      teamsBelowMin: 0,
    };
    if (lockedAtIso) {
      const lockTs = new Date(lockedAtIso).getTime();
      const diffMs = lockTs - NOW_MS;
      rosterLockProximity.hoursLeft =
        diffMs > 0 ? Math.ceil(diffMs / 3_600_000) : 0;

      // Count teams below min_players (only meaningful if min_players is set and lock not passed)
      if (tournament.min_players && tournament.min_players > 0 && diffMs > 0) {
        const memberRows = (teamMembersCountRes.data ?? []) as {
          team_id: string;
        }[];
        const counts = new Map<string, number>();
        for (const r of memberRows) {
          counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);
        }
        // Teams registered to this tournament that are below the min
        const registeredTeamIds = new Set(
          tournamentTeams
            .map((tt) => tt.team_id)
            .filter((x): x is string => !!x)
        );
        let below = 0;
        for (const teamId of registeredTeamIds) {
          if ((counts.get(teamId) ?? 0) < tournament.min_players) below++;
        }
        rosterLockProximity.teamsBelowMin = below;
      }
    }

    // 6) Stages prêts à advance (tous matchs hors cancelled finis + advancement_rules présent)
    const stagesReadyToAdvance: StageReady[] = [];
    // Only re-fetch settings for stages that look done (faster than always re-querying)
    const candidateStageIds = stageProgress
      .filter(
        (sp) =>
          sp.is_active &&
          sp.totalMatches > 0 &&
          sp.finishedMatches + sp.cancelledMatches === sp.totalMatches
      )
      .map((sp) => sp.id);
    if (candidateStageIds.length > 0) {
      const { data: stageSettings } = await supabaseAdmin
        .from('tournament_stages')
        .select('id, name, settings')
        .in('id', candidateStageIds);
      for (const s of stageSettings || []) {
        const rules = (s as any).settings?.advancement_rules;
        if (
          rules &&
          rules.target_stage_id &&
          (rules.advance_top || rules.advance_per_group)
        ) {
          stagesReadyToAdvance.push({ stageId: s.id, stageName: s.name });
        }
      }
    }

    // 7) Status guards (transition allowed/blocked + raison)
    const stageCount = stages.length;
    const teamCount = tournamentTeams.length;
    const nonCancelledMatches = matches.filter(
      (m) => m.status !== 'cancelled'
    ).length;
    const currentStatus = tournament.status ?? 'draft';
    const guardList: StatusGuard[] = [
      { status: 'draft', label: STATUS_LABELS.draft, allowed: true },
      {
        status: 'published',
        label: STATUS_LABELS.published,
        allowed: stageCount > 0,
        reason: stageCount > 0 ? undefined : 'Aucune phase configurée',
      },
      {
        status: 'running',
        label: STATUS_LABELS.running,
        allowed: stageCount > 0 && teamCount > 0,
        reason:
          stageCount > 0 && teamCount > 0
            ? undefined
            : stageCount === 0
              ? 'Aucune phase'
              : 'Aucune équipe inscrite',
      },
      {
        status: 'completed',
        label: STATUS_LABELS.completed,
        allowed:
          nonCancelledMatches > 0 && finishedMatches === nonCancelledMatches,
        reason:
          nonCancelledMatches > 0 && finishedMatches === nonCancelledMatches
            ? undefined
            : `Il reste ${nonCancelledMatches - finishedMatches} match(s) non terminé(s)`,
      },
      { status: 'archived', label: STATUS_LABELS.archived, allowed: true },
    ];

    const signals: DashboardSignals = {
      disputesOpen: { count: disputedRows.length, matches: disputedMatches },
      checkinNext24h: checkin24h,
      conflictsCount,
      pendingTeamsCount: pendingTeamsCountRes.count ?? 0,
      rosterLockProximity,
      supportHighOpen: supportHighRes.count ?? 0,
      activeMvpPolls: activeMvpPollsRes.data?.length ?? 0,
      stagesReadyToAdvance,
      liveMatches,
    };

    // Cache 30s, stale-while-revalidate 60s pour les gros tournois
    res.setHeader(
      'Cache-Control',
      'private, max-age=30, stale-while-revalidate=60'
    );

    return res.status(200).json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        start_date: tournament.start_date,
        end_date: tournament.end_date,
        timezone: tournament.timezone ?? null,
        format: tournament.format ?? null,
        min_players: tournament.min_players ?? null,
        roster_locked_at: tournament.roster_locked_at ?? null,
      },
      summary: {
        totalTeams,
        totalMatches,
        finishedMatches,
        pendingMatches,
        ongoingMatches,
        completionPercent,
        eliminatedTeams: eliminatedTeams.size,
        activeTeams,
      },
      stages: stageProgress,
      upcomingMatches,
      alerts,
      signals,
      guards: { current_status: currentStatus, guards: guardList },
    });
  } catch (err: unknown) {
    console.error('[/api/admin/tournament/[id]/dashboard] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
