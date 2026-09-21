// pages/api/admin/stages/[stageId]/batch-scores.ts
// Admin: appliquer des scores à plusieurs matchs d'un stage en un seul appel.
//
// POST : batch score update
// Body : {
//   scores: Array<{
//     matchId: string,
//     team1Score: number,
//     team2Score: number,
//     winnerTeamId?: string | null,
//     status?: MatchStatus,
//     forfeitTeamId?: string | null,
//     propagate?: boolean
//   }>
// }
//
// Réponse : {
//   results: Array<{ matchId: string, success: boolean, error?: string, winnerTeamId?: string | null }>,
//   successCount: number,
//   failureCount: number
// }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
import type { MatchStatus } from '@/types/admin';
export default withStaffRoute(handler, { permission: 'manage_tournaments' });

/**
 * Les valeurs que `matches.status` peut prendre, et la garde qui s'en assure.
 *
 * Recopier l'union en tableau n'est pas une duplication : `satisfies` lie les
 * deux, et un statut ajouté au type sans l'être ici devient une erreur de
 * compilation.
 */
const MATCH_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'postponed',
  'disputed',
  'walkover',
] as const satisfies readonly MatchStatus[];

function isMatchStatus(v: unknown): v is MatchStatus {
  return (
    typeof v === 'string' && (MATCH_STATUSES as readonly string[]).includes(v)
  );
}

type ScoreEntry = {
  matchId: string;
  team1Score?: number;
  team2Score?: number;
  winnerTeamId?: string | null;
  status?: string;
  forfeitTeamId?: string | null;
  propagate?: boolean;
};

type ResultEntry = {
  matchId: string;
  success: boolean;
  error?: string;
  winnerTeamId?: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  // Verify stage exists
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  // Guard: reject if tournament is completed
  const { data: tournament } = await supabaseAdmin
    .from('tournaments')
    .select('status')
    .eq('id', stage.tournament_id)
    .maybeSingle();

  if (tournament?.status === 'completed') {
    return res.status(403).json({
      error: 'Impossible de modifier les scores : le tournoi est terminé.',
      code: 'TOURNAMENT_COMPLETED',
    });
  }

  const { scores } = req.body as { scores?: ScoreEntry[] };

  if (!Array.isArray(scores) || scores.length === 0) {
    return res.status(400).json({
      error: 'Body must contain a non-empty "scores" array',
    });
  }

  if (scores.length > 50) {
    return res.status(400).json({
      error: 'Maximum 50 scores per batch',
    });
  }

  // Validate all matchIds upfront
  //
  // LE STATUT EST VALIDÉ ICI, ET C'EST NOUVEAU. `ScoreEntry.status` est une
  // chaîne LIBRE issue du corps de requête ; elle partait vers
  // `applyMatchScore` derrière un `as any`, donc directement dans la colonne
  // `matches.status` sans que rien ne vérifie qu'elle en soit une valeur.
  // Un appel avec `status: "termine"` l'aurait écrite telle quelle, et tous
  // les filtres par statut auraient cessé de voir ce match.
  const validated: Array<
    Omit<ScoreEntry, 'status'> & { status?: MatchStatus }
  > = [];
  for (const entry of scores) {
    if (!entry.matchId || !isValidUUID(entry.matchId)) {
      return res.status(400).json({
        error: `Invalid matchId: ${entry.matchId}`,
      });
    }
    let status: MatchStatus | undefined;
    if (entry.status !== undefined) {
      if (!isMatchStatus(entry.status)) {
        return res.status(400).json({
          error: `Invalid status: ${entry.status}`,
        });
      }
      status = entry.status;
    }
    validated.push({ ...entry, status });
  }

  // Verify all matches belong to this stage
  const matchIds = scores.map((s) => s.matchId);
  const { data: matchRows, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select('id, stage_id')
    .in('id', matchIds);

  if (matchErr) {
    return res.status(500).json({ error: 'Failed to verify matches' });
  }

  const matchStageMap = new Map(
    ((matchRows || []) as { id: string; stage_id: string | null }[]).map(
      (m) => [m.id, m.stage_id]
    )
  );
  for (const entry of scores) {
    if (matchStageMap.get(entry.matchId) !== stageId) {
      return res.status(400).json({
        error: `Match ${entry.matchId} does not belong to stage ${stageId}`,
      });
    }
  }

  // Process each score sequentially (order matters for bracket propagation)
  const results: ResultEntry[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const entry of validated) {
    try {
      const result = await applyMatchScore({
        tenantId: ctx.tenantId,
        matchId: entry.matchId,
        team1Score: entry.team1Score,
        team2Score: entry.team2Score,
        winnerTeamId: entry.winnerTeamId,
        forfeitTeamId: entry.forfeitTeamId,
        status: entry.status,
        markFinished: !entry.status && !entry.forfeitTeamId,
        staffId: ctx.staff?.id ?? null,
        propagateBracket: entry.propagate !== false,
      });

      results.push({
        matchId: entry.matchId,
        success: true,
        winnerTeamId: result.winnerTeamId,
      });
      successCount++;
    } catch (err: unknown) {
      results.push({
        matchId: entry.matchId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      failureCount++;
    }
  }

  // Log batch action
  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'staff_batch_action',
        entity_type: 'match',
        entity_id: stageId,
        tournament_id: stage.tournament_id,
        payload: {
          action: 'batch_scores',
          count: scores.length,
          successCount,
          failureCount,
        },
      });
    } catch (e) {
      logger.error('batch-scores: logStaffAction error', e);
    }
  }

  const httpStatus = failureCount > 0 && successCount === 0 ? 500 : 200;

  return res.status(httpStatus).json({
    results,
    successCount,
    failureCount,
  });
}
