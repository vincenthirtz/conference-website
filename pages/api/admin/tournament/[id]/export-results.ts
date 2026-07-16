// pages/api/admin/tournament/[id]/export-results.ts
// GET ?format=csv|json : exporte tous les resultats d'un tournoi.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  const tournamentId = String(id);
  const format = req.query.format === 'json' ? 'json' : 'csv';

  try {
    // Fetch tournament (scoped to current tenant)
    const { data: tournament, error: tournamentErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug, game, status')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (tournamentErr || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Fetch stages
    const { data: stages } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, name, stage_type, order_index')
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .order('order_index', { ascending: true });

    const stageMap = new Map<string, { name: string; stage_type: string }>();
    for (const s of stages || []) {
      stageMap.set(s.id, { name: s.name, stage_type: s.stage_type });
    }

    // Fetch all matches (non-cancelled, scoped to current tenant)
    const { data: matches } = await supabaseAdmin
      .from('matches')
      .select(
        'id, stage_id, status, round_number, round_name, bracket_side, team1_id, team2_id, team1_score, team2_score, winner_team_id, scheduled_at, completed_at, match_format, best_of, is_bye'
      )
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true, nullsFirst: false });

    // Fetch team names
    const teamIds = new Set<string>();
    for (const m of matches || []) {
      if (m.team1_id) teamIds.add(m.team1_id);
      if (m.team2_id) teamIds.add(m.team2_id);
    }

    const teamNameMap = new Map<string, string>();
    if (teamIds.size > 0) {
      const { data: teamsData } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .in('id', Array.from(teamIds))
        .eq('tenant_id', ctx.tenantId);

      for (const t of teamsData || []) {
        teamNameMap.set(t.id, t.name);
      }
    }

    // Build export rows
    const rows = (matches || []).map((m) => {
      const stageInfo = m.stage_id ? stageMap.get(m.stage_id) : null;
      return {
        match_id: m.id,
        stage: stageInfo?.name || '',
        stage_type: stageInfo?.stage_type || '',
        round: m.round_number ?? '',
        round_name: m.round_name || '',
        bracket_side: m.bracket_side || '',
        team1: m.team1_id ? teamNameMap.get(m.team1_id) || m.team1_id : '',
        team2: m.team2_id ? teamNameMap.get(m.team2_id) || m.team2_id : '',
        score:
          m.team1_score != null && m.team2_score != null
            ? `${m.team1_score}-${m.team2_score}`
            : '',
        team1_score: m.team1_score ?? '',
        team2_score: m.team2_score ?? '',
        winner: m.winner_team_id
          ? teamNameMap.get(m.winner_team_id) || m.winner_team_id
          : '',
        status: m.status,
        format: m.best_of ? `BO${m.best_of}` : m.match_format || '',
        scheduled_at: m.scheduled_at || '',
        completed_at: m.completed_at || '',
        is_bye: m.is_bye ? 'true' : 'false',
      };
    });

    const slugSafe = (
      tournament.slug ||
      tournament.name ||
      tournamentId
    ).replace(/[^a-zA-Z0-9_-]/g, '_');

    if (format === 'json') {
      const exportData = {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          game: tournament.game,
          status: tournament.status,
        },
        exportedAt: new Date().toISOString(),
        totalMatches: rows.length,
        results: rows,
      };

      const filename = `results-${slugSafe}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.status(200).end(JSON.stringify(exportData, null, 2));
      return;
    }

    // CSV
    const header = [
      'match_id',
      'stage',
      'stage_type',
      'round',
      'round_name',
      'bracket_side',
      'team1',
      'team2',
      'score',
      'team1_score',
      'team2_score',
      'winner',
      'status',
      'format',
      'scheduled_at',
      'completed_at',
      'is_bye',
    ];

    const escapeCsv = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const csvRows = rows.map((r) =>
      header.map((h) => escapeCsv((r as any)[h])).join(',')
    );

    const csv = [header.join(','), ...csvRows].join('\n');
    const filename = `results-${slugSafe}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).end(csv);
  } catch (err: unknown) {
    logger.error('[export-results] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
