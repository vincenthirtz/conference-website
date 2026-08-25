// utils/leagues/recomputeLeagueStandings.ts
//
// Recalcul du cache `league_standings` d'une saison, à partir des
// `final_rankings` des tournois liés ET des scrims rattachés (moteur pur
// `computeLeagueStandings`).
//
// Extrait depuis `pages/api/admin/leagues/[id]/recompute.ts` afin d'être
// réutilisable hors requête HTTP (scripts de reprise, jobs), sur le même
// modèle que `readPublicLeagues` / `readLeaderboard`. Le handler admin délègue
// désormais ici et se contente de l'auth, du rate-limit et du journal staff.
//
// Contrat de retour : un `error` non nul décrit un échec de lecture/écriture ;
// `league_not_found` distingue le 404 des erreurs serveur.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  computeLeagueStandings,
  DEFAULT_SCRIM_POINTS,
  type LeagueTournamentRef,
  type LeagueRankingRow,
  type LeagueScrimResult,
  type ScrimPointsTable,
} from '@/utils/leagues/computeStandings';

export type RecomputeLeagueResult =
  | { ok: true; standingsCount: number; scrimsCounted: number }
  | { ok: false; error: 'league_not_found' | string };

export async function recomputeLeagueStandings(
  tenantId: string,
  leagueId: string
): Promise<RecomputeLeagueResult> {
  if (!supabaseAdmin) return { ok: false, error: 'Database unavailable' };

  // 1) League + points_table.
  const { data: league, error: lErr } = await supabaseAdmin
    .from('leagues')
    .select('id, points_table')
    .eq('tenant_id', tenantId)
    .eq('id', leagueId)
    .maybeSingle();
  if (lErr) {
    logger.error('[recomputeLeagueStandings] league read error', lErr);
    return { ok: false, error: 'Failed to load league' };
  }
  if (!league) return { ok: false, error: 'league_not_found' };

  const pointsTable = (league.points_table as Record<string, number>) ?? {};

  // 2) Tournois liés (+ weight).
  const { data: linkRows, error: ltErr } = await supabaseAdmin
    .from('league_tournaments')
    .select('tournament_id, weight')
    .eq('tenant_id', tenantId)
    .eq('league_id', leagueId);
  if (ltErr) {
    logger.error('[recomputeLeagueStandings] links read error', ltErr);
    return { ok: false, error: 'Failed to load league tournaments' };
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
      .eq('tenant_id', tenantId)
      .in('tournament_id', tournamentIds);
    if (frErr) {
      logger.error('[recomputeLeagueStandings] rankings read error', frErr);
      return { ok: false, error: 'Failed to load rankings' };
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
    .eq('tenant_id', tenantId)
    .eq('league_id', leagueId);
  if (lsErr) {
    logger.error('[recomputeLeagueStandings] scrim links read error', lsErr);
    return { ok: false, error: 'Failed to load league scrims' };
  }
  const weightByScrim = new Map<string, number>(
    (
      (scrimLinks || []) as Array<{ scrim_id: string; weight: number | null }>
    ).map((r) => [r.scrim_id, r.weight ?? 1])
  );

  let scrims: LeagueScrimResult[] = [];
  if (weightByScrim.size > 0) {
    const { data: scrimRows, error: sErr } = await supabaseAdmin
      .from('scrims')
      .select('id, team1_id, team2_id, winner_team_id')
      .eq('tenant_id', tenantId)
      .in('id', [...weightByScrim.keys()])
      .eq('status', 'completed')
      .eq('ranked', true)
      .is('deleted_at', null);
    if (sErr) {
      logger.error('[recomputeLeagueStandings] scrims read error', sErr);
      return { ok: false, error: 'Failed to load scrims' };
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
    .eq('tenant_id', tenantId)
    .eq('league_id', leagueId);
  if (delErr) {
    logger.error('[recomputeLeagueStandings] delete standings error', delErr);
    return { ok: false, error: 'Failed to reset standings' };
  }

  if (standings.length > 0) {
    const nowIso = new Date().toISOString();
    const inserts = standings.map((s) => ({
      league_id: leagueId,
      tenant_id: tenantId,
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
      logger.error('[recomputeLeagueStandings] insert standings error', insErr);
      return { ok: false, error: 'Failed to write standings' };
    }
  }

  return {
    ok: true,
    standingsCount: standings.length,
    scrimsCounted: scrims.length,
  };
}
