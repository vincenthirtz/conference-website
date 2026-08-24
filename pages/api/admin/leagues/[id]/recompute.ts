// pages/api/admin/leagues/[id]/recompute.ts
// POST → recalcule les standings d'une league à partir des final_rankings
// des tournois liés ET des scrims rattachés (moteur pur
// computeLeagueStandings), puis remplace league_standings.
// → { standings_count }.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  computeLeagueStandings,
  DEFAULT_SCRIM_POINTS,
  type LeagueTournamentRef,
  type LeagueRankingRow,
  type LeagueScrimResult,
  type ScrimPointsTable,
} from '@/utils/leagues/computeStandings';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'admin-leagues-recompute'
    )
  )
    return;

  const rawId = req.query.id;
  const leagueId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!leagueId || !isValidUUID(leagueId)) {
    return res.status(400).json({ error: 'Missing or invalid league id' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) League + points_table.
  const { data: league, error: lErr } = await supabaseAdmin
    .from('leagues')
    .select('id, points_table')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', leagueId)
    .maybeSingle();
  if (lErr) {
    logger.error('[admin/leagues/recompute] league read error', lErr);
    return res.status(500).json({ error: 'Failed to load league' });
  }
  if (!league) return res.status(404).json({ error: 'League not found' });

  const pointsTable = (league.points_table as Record<string, number>) ?? {};

  // 2) Tournois liés (+ weight).
  const { data: linkRows, error: ltErr } = await supabaseAdmin
    .from('league_tournaments')
    .select('tournament_id, weight')
    .eq('tenant_id', ctx.tenantId)
    .eq('league_id', leagueId);
  if (ltErr) {
    logger.error('[admin/leagues/recompute] links read error', ltErr);
    return res.status(500).json({ error: 'Failed to load league tournaments' });
  }
  const tournaments: LeagueTournamentRef[] = (
    (linkRows || []) as Array<{ tournament_id: string; weight: number | null }>
  ).map((r) => ({ tournamentId: r.tournament_id, weight: r.weight ?? 1 }));

  // 3) final_rankings des tournois liés.
  const tournamentIds = tournaments.map((t) => t.tournamentId);
  let rankings: LeagueRankingRow[] = [];
  if (tournamentIds.length > 0) {
    const { data: frRows, error: frErr } = await supabaseAdmin
      .from('final_rankings')
      .select('tournament_id, team_id, rank')
      .eq('tenant_id', ctx.tenantId)
      .in('tournament_id', tournamentIds);
    if (frErr) {
      logger.error('[admin/leagues/recompute] rankings read error', frErr);
      return res.status(500).json({ error: 'Failed to load rankings' });
    }
    rankings = (
      (frRows || []) as Array<{
        tournament_id: string;
        team_id: string;
        rank: number;
      }>
    ).map((r) => ({
      tournamentId: r.tournament_id,
      teamId: r.team_id,
      rank: r.rank,
    }));
  }

  // 3 bis) Scrims rattachés à la saison. Seuls comptent ceux effectivement
  //        joués et classés — mêmes critères que le ladder d'entraînement
  //        (utils/scrims/ladder.ts), pour qu'un scrim ne puisse pas peser
  //        dans la saison sans peser dans le ladder.
  const { data: scrimLinks, error: lsErr } = await supabaseAdmin
    .from('league_scrims')
    .select('scrim_id, weight')
    .eq('tenant_id', ctx.tenantId)
    .eq('league_id', leagueId);
  if (lsErr) {
    logger.error('[admin/leagues/recompute] scrim links read error', lsErr);
    return res.status(500).json({ error: 'Failed to load league scrims' });
  }
  const weightByScrim = new Map<string, number>(
    ((scrimLinks || []) as Array<{ scrim_id: string; weight: number | null }>)
      .map((r) => [r.scrim_id, r.weight ?? 1])
  );

  let scrims: LeagueScrimResult[] = [];
  if (weightByScrim.size > 0) {
    const { data: scrimRows, error: sErr } = await supabaseAdmin
      .from('scrims')
      .select('id, team1_id, team2_id, winner_team_id')
      .eq('tenant_id', ctx.tenantId)
      .in('id', [...weightByScrim.keys()])
      .eq('status', 'completed')
      .eq('ranked', true)
      .is('deleted_at', null);
    if (sErr) {
      logger.error('[admin/leagues/recompute] scrims read error', sErr);
      return res.status(500).json({ error: 'Failed to load scrims' });
    }
    scrims = (
      (scrimRows || []) as Array<{
        id: string;
        team1_id: string | null;
        team2_id: string | null;
        winner_team_id: string | null;
      }>
    ).map((r) => ({
      scrimId: r.id,
      team1Id: r.team1_id,
      team2Id: r.team2_id,
      winnerTeamId: r.winner_team_id,
      weight: weightByScrim.get(r.id) ?? 1,
    }));
  }

  // Barème des scrims : surchargeable par saison via les clés `scrim_win` /
  // `scrim_draw` / `scrim_loss` de `points_table`, qui sert déjà de réglage
  // par saison pour les tournois. Une saison qui n'y touche pas garde 3/1/0.
  const scrimPoints: ScrimPointsTable = {
    win: Number(pointsTable.scrim_win ?? DEFAULT_SCRIM_POINTS.win),
    draw: Number(pointsTable.scrim_draw ?? DEFAULT_SCRIM_POINTS.draw),
    loss: Number(pointsTable.scrim_loss ?? DEFAULT_SCRIM_POINTS.loss),
  };

  // 4) Moteur pur.
  const standings = computeLeagueStandings({
    tournaments,
    rankings,
    pointsTable,
    scrims,
    scrimPoints,
  });

  // 5) Remplacer league_standings (delete + insert).
  const { error: delErr } = await supabaseAdmin
    .from('league_standings')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('league_id', leagueId);
  if (delErr) {
    logger.error('[admin/leagues/recompute] delete standings error', delErr);
    return res.status(500).json({ error: 'Failed to reset standings' });
  }

  if (standings.length > 0) {
    const nowIso = new Date().toISOString();
    const inserts = standings.map((s) => ({
      league_id: leagueId,
      tenant_id: ctx.tenantId,
      team_id: s.teamId,
      points: s.points,
      tournaments_counted: s.tournamentsCounted,
      scrims_counted: s.scrimsCounted,
      best_rank: s.bestRank,
      rank: s.rank,
      updated_at: nowIso,
    }));
    const { error: insErr } = await supabaseAdmin
      .from('league_standings')
      .insert(inserts);
    if (insErr) {
      logger.error('[admin/leagues/recompute] insert standings error', insErr);
      return res.status(500).json({ error: 'Failed to write standings' });
    }
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'league',
    entity_id: leagueId,
    tenant_id: ctx.tenantId,
    payload: {
      operation: 'recompute_standings',
      standings_count: standings.length,
      scrims_counted: scrims.length,
    },
  });

  return res.status(200).json({ standings_count: standings.length });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'leagues-recompute' }),
  'admin'
);
