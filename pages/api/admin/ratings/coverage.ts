// pages/api/admin/ratings/coverage.ts
//
// GET — couverture du rating joueur : combien de matchs terminés ont
// effectivement produit des ratings, et **pourquoi** les autres n'en ont pas.
//
// Pourquoi cet écran (R1 du backlog réseau) : le rating est branché en
// incrémental sur l'application d'un score (utils/matches/applyScore.ts) et
// rejouable via POST /api/admin/ratings/rebuild. Mais un match peut être
// terminé ET rester non noté sans qu'aucune erreur ne soit levée — le moteur
// Glicko-2 a besoin de participants des DEUX côtés, or `match_participants`
// est un snapshot du roster : si une équipe n'a aucun membre rattaché à un
// compte, le match ne produit rien, en silence.
//
// C'est exactement le cas observé en prod le 2026-07-31 : 7 matchs terminés,
// 1 seul noté. Sans cet écran, le staff n'a aucun moyen de distinguer « le
// rating est cassé » de « les rosters sont incomplets ».
//
// Réponse :
//   {
//     finished, rated, unrated,
//     samples: [{ matchId, reason, team1, team2, completedAt }]  // max 20
//   }
// `reason` : 'no_participants' (aucun côté snapshotté) | 'one_side_only'
//            (un seul côté) | 'unknown' (participants des 2 côtés mais aucune
//            ligne d'historique — anomalie réelle, à investiguer).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

const MAX_SAMPLES = 20;

export type RatingCoverageReason =
  | 'no_participants'
  | 'one_side_only'
  | 'unknown';

export type RatingCoverageSample = {
  matchId: string;
  reason: RatingCoverageReason;
  team1: string | null;
  team2: string | null;
  completedAt: string | null;
};

export type RatingCoverageResponse = {
  finished: number;
  rated: number;
  unrated: number;
  samples: RatingCoverageSample[];
};

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RatingCoverageResponse | { error: string }>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-ratings-coverage'
    )
  ) {
    return;
  }

  const tenantId = ctx.tenantId;

  // 1) Matchs « notables » : mêmes critères que rebuildRatings (terminé ou
  //    walkover, pas un bye, vainqueur et deux équipes connus).
  const { data: matchRows, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select('id, team1_id, team2_id, winner_team_id, completed_at, is_bye')
    .eq('tenant_id', tenantId)
    .in('status', ['finished', 'walkover']);

  if (matchErr) {
    logger.error('[ratings/coverage] matches read error', matchErr);
    return res.status(500).json({ error: 'Lecture des matchs impossible.' });
  }

  const matches = ((matchRows || []) as Array<Record<string, unknown>>)
    .map((m) => ({
      id: m.id as string,
      team1Id: (m.team1_id as string | null) ?? null,
      team2Id: (m.team2_id as string | null) ?? null,
      completedAt: (m.completed_at as string | null) ?? null,
      isBye: Boolean(m.is_bye),
      winnerTeamId: (m.winner_team_id as string | null) ?? null,
    }))
    .filter((m) => !m.isBye && m.winnerTeamId && m.team1Id && m.team2Id);

  if (matches.length === 0) {
    return res
      .status(200)
      .json({ finished: 0, rated: 0, unrated: 0, samples: [] });
  }

  const matchIds = matches.map((m) => m.id);

  // 2) Matchs ayant produit au moins une ligne d'historique = matchs notés.
  const [historyRes, participantsRes, teamsRes] = await Promise.all([
    supabaseAdmin
      .from('player_rating_history')
      .select('match_id')
      .eq('tenant_id', tenantId)
      .in('match_id', matchIds),
    supabaseAdmin
      .from('match_participants')
      .select('match_id, team_id')
      .eq('tenant_id', tenantId)
      .in('match_id', matchIds),
    supabaseAdmin.from('teams').select('id, name').eq('tenant_id', tenantId),
  ]);

  if (historyRes.error) {
    logger.error('[ratings/coverage] history read error', historyRes.error);
    return res
      .status(500)
      .json({ error: "Lecture de l'historique impossible." });
  }

  const ratedMatchIds = new Set<string>();
  for (const row of (historyRes.data || []) as Array<{ match_id: string }>) {
    ratedMatchIds.add(row.match_id);
  }

  // Côtés effectivement snapshottés, par match.
  const sidesByMatch = new Map<string, Set<string>>();
  for (const row of (participantsRes.data || []) as Array<{
    match_id: string;
    team_id: string | null;
  }>) {
    if (!row.team_id) continue;
    const set = sidesByMatch.get(row.match_id) ?? new Set<string>();
    set.add(row.team_id);
    sidesByMatch.set(row.match_id, set);
  }

  const teamName = new Map<string, string>();
  for (const t of (teamsRes.data || []) as Array<{
    id: string;
    name: string;
  }>) {
    teamName.set(t.id, t.name);
  }

  const samples: RatingCoverageSample[] = [];
  for (const m of matches) {
    if (ratedMatchIds.has(m.id)) continue;
    if (samples.length >= MAX_SAMPLES) break;

    const sides = sidesByMatch.get(m.id);
    let reason: RatingCoverageReason;
    if (!sides || sides.size === 0) reason = 'no_participants';
    else if (sides.size < 2) reason = 'one_side_only';
    else reason = 'unknown';

    samples.push({
      matchId: m.id,
      reason,
      team1: m.team1Id ? (teamName.get(m.team1Id) ?? null) : null,
      team2: m.team2Id ? (teamName.get(m.team2Id) ?? null) : null,
      completedAt: m.completedAt,
    });
  }

  const rated = matches.filter((m) => ratedMatchIds.has(m.id)).length;

  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json({
    finished: matches.length,
    rated,
    unrated: matches.length - rated,
    samples,
  });
}
