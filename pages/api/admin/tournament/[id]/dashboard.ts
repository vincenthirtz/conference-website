// pages/api/admin/tournament/[id]/dashboard.ts
// GET : retourne une vue synthetique de la progression du tournoi.
// Matchs joues/restants, equipes eliminees, prochains matchs, alertes.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

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

type DashboardData = {
  tournament: {
    id: string;
    name: string;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    timezone: string | null;
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
};

type ApiResponse = DashboardData | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable (missing service role).' });
  }

  const tournamentId = String(id);

  try {
    // Fetch tournament
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, status, start_date, end_date, timezone')
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

    // Fetch all matches
    const { data: matchesData } = await supabaseAdmin
      .from('matches')
      .select(
        'id, stage_id, status, round_number, round_name, scheduled_at, stream_url, team1_id, team2_id, winner_team_id, is_bye, bracket_side'
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
        finishedMatches: stageMatches.filter((m) => m.status === 'finished').length,
        pendingMatches: stageMatches.filter((m) => m.status === 'pending').length,
        ongoingMatches: stageMatches.filter((m) => m.status === 'ongoing').length,
        cancelledMatches: stageMatches.filter((m) => m.status === 'cancelled').length,
        teamsCount: stageTeamCounts.get(s.id) ?? 0,
      };
    });

    // Summary
    const totalMatches = matches.filter((m) => m.status !== 'cancelled').length;
    const finishedMatches = matches.filter((m) => m.status === 'finished').length;
    const pendingMatches = matches.filter((m) => m.status === 'pending').length;
    const ongoingMatches = matches.filter((m) => m.status === 'ongoing').length;

    // Eliminated teams: teams that lost in bracket matches (have a loss and no upcoming matches)
    const teamsWithLoss = new Set<string>();
    const teamsWithUpcoming = new Set<string>();

    for (const m of matches) {
      if (m.status === 'finished' && m.winner_team_id && !m.is_bye) {
        const loserId = m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id;
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
        return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
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
      stage_name: m.stage_id ? stageNameMap.get(m.stage_id) ?? null : null,
      round_number: m.round_number,
      round_name: m.round_name,
      scheduled_at: m.scheduled_at,
      team1_name: m.team1_id ? teamNameMap.get(m.team1_id) ?? null : null,
      team2_name: m.team2_id ? teamNameMap.get(m.team2_id) ?? null : null,
      stream_url: m.stream_url,
    }));

    // Alerts
    const alerts: Alert[] = [];

    // Matches without stream
    const noStreamCount = matches.filter(
      (m) => (m.status === 'pending' || m.status === 'ongoing') && !m.stream_url && !m.is_bye
    ).length;
    if (noStreamCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${noStreamCount} match(s) a venir sans stream attribue.`,
      });
    }

    // Matches with missing teams
    const missingTeamsCount = matches.filter(
      (m) =>
        m.status === 'pending' &&
        !m.is_bye &&
        (!m.team1_id || !m.team2_id)
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
    const completionPercent = totalMatches > 0
      ? Math.round((finishedMatches / totalMatches) * 100)
      : 0;

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
    });
  } catch (err: any) {
    console.error('[/api/admin/tournament/[id]/dashboard] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
