// pages/api/admin/tournament/[id]/bulk-matches.ts
// Operations en masse au niveau tournoi (cross-stage).
// Differencie de /api/admin/stages/[stageId]/bulk-matches qui se limite a un stage.
//
// Modes supportes :
//   POST { mode: 'shift_round', stageId, roundNumber, offsetMinutes }
//     -> decale scheduled_at de tous les matchs du round (offset en minutes, peut etre negatif)
//     -> matchs sans scheduled_at sont ignores
//   POST { mode: 'reassign_stage', matchIds, targetStageId }
//     -> deplace les matchs cibles vers un autre stage du meme tournoi
//     -> rejette si un match a des liens bracket actifs (next_match_*)
//        ou si une dispute est ouverte
//     -> reset group_key (l'assignation depend du stage cible)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
type ApiResponse =
  | {
      mode: 'shift_round';
      shifted: number;
      ignored: number;
      offsetMinutes: number;
    }
  | {
      mode: 'reassign_stage';
      moved: string[];
      skipped: { matchId: string; reason: string }[];
      targetStageId: string;
    }
  | { error: string };

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
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
  const body = req.body || {};

  try {
    if (body.mode === 'shift_round') {
      return await handleShiftRound(tournamentId, body, res, ctx);
    }
    if (body.mode === 'reassign_stage') {
      return await handleReassignStage(tournamentId, body, res, ctx);
    }
    return res.status(400).json({
      error: "Invalid mode. Use 'shift_round' or 'reassign_stage'.",
    });
  } catch (err: unknown) {
    logger.error('[admin/tournament/bulk-matches] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* -----------------------------------------------------------
 * shift_round : decale tout un round
 * ---------------------------------------------------------*/

async function handleShiftRound(
  tournamentId: string,
  body: any,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { stageId, roundNumber, offsetMinutes } = body;

  if (!stageId || typeof stageId !== 'string' || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }
  if (typeof roundNumber !== 'number' || !Number.isInteger(roundNumber)) {
    return res.status(400).json({ error: 'roundNumber must be an integer' });
  }
  if (typeof offsetMinutes !== 'number' || !Number.isFinite(offsetMinutes)) {
    return res.status(400).json({ error: 'offsetMinutes must be a number' });
  }

  if (offsetMinutes === 0) {
    return res
      .status(400)
      .json({ error: 'offsetMinutes cannot be 0 (no shift to apply)' });
  }

  // Verifier que le stage appartient au tournoi (scoped to current tenant)
  const { data: stage } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!stage || stage.tournament_id !== tournamentId) {
    return res
      .status(404)
      .json({ error: 'Stage not found in this tournament' });
  }

  // Recuperer les matchs du round avec scheduled_at non-null
  const { data: matches, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('id, scheduled_at, status')
    .eq('stage_id', stageId)
    .eq('tenant_id', ctx.tenantId)
    .eq('round_number', roundNumber)
    .neq('status', 'cancelled');

  if (fetchErr) {
    return res.status(500).json({ error: 'Failed to fetch round matches' });
  }

  const list = matches || [];
  const toShift = list.filter((m) => m.scheduled_at);
  const ignored = list.length - toShift.length;

  if (toShift.length === 0) {
    return res.status(200).json({
      mode: 'shift_round',
      shifted: 0,
      ignored,
      offsetMinutes,
    });
  }

  const offsetMs = offsetMinutes * 60 * 1000;

  // On fait un update par match pour preserver les heures individuelles (decalage relatif).
  // Pour 8-32 matchs c'est OK. Snapshot pour rollback en cas d'echec partiel.
  const succeeded: { id: string; previous: string }[] = [];

  for (const m of toShift) {
    const newDate = new Date(
      new Date(m.scheduled_at as string).getTime() + offsetMs
    ).toISOString();

    const { error: updErr } = await supabaseAdmin
      .from('matches')
      .update({ scheduled_at: newDate, updated_at: new Date().toISOString() })
      .eq('id', m.id)
      .eq('tenant_id', ctx.tenantId);

    if (updErr) {
      // Rollback
      for (const prev of succeeded) {
        await supabaseAdmin
          .from('matches')
          .update({ scheduled_at: prev.previous })
          .eq('id', prev.id)
          .eq('tenant_id', ctx.tenantId);
      }
      return res.status(500).json({
        error: `Echec sur le match ${m.id}. Rollback effectue.`,
      });
    }

    succeeded.push({ id: m.id, previous: m.scheduled_at as string });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'staff_batch_action',
        entity_type: 'match',
        entity_id: stageId,
        tournament_id: tournamentId,
        payload: {
          action: 'shift_round',
          stage_id: stageId,
          round_number: roundNumber,
          offset_minutes: offsetMinutes,
          shifted_count: succeeded.length,
        },
      });
    } catch (e) {
      logger.error('shift_round logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    mode: 'shift_round',
    shifted: succeeded.length,
    ignored,
    offsetMinutes,
  });
}

/* -----------------------------------------------------------
 * reassign_stage : deplace des matchs vers un autre stage
 * ---------------------------------------------------------*/

async function handleReassignStage(
  tournamentId: string,
  body: any,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { matchIds, targetStageId } = body;

  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'matchIds must be a non-empty array' });
  }
  if (
    !targetStageId ||
    typeof targetStageId !== 'string' ||
    !isValidUUID(targetStageId)
  ) {
    return res.status(400).json({ error: 'Invalid targetStageId' });
  }

  // Verifier que le stage cible appartient au tournoi (scoped to current tenant)
  const { data: targetStage } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', targetStageId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!targetStage || targetStage.tournament_id !== tournamentId) {
    return res
      .status(404)
      .json({ error: 'Target stage not found in this tournament' });
  }

  // Charger les matchs cibles (scoped to current tenant)
  const { data: matches, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      'id, tournament_id, stage_id, status, next_match_win_id, next_match_lose_id'
    )
    .in('id', matchIds)
    .eq('tenant_id', ctx.tenantId);

  if (matchErr) {
    return res.status(500).json({ error: 'Failed to fetch matches' });
  }

  const fetched = matches || [];
  const moved: string[] = [];
  const skipped: { matchId: string; reason: string }[] = [];

  for (const id of matchIds) {
    const m = fetched.find((x) => x.id === id);
    if (!m) {
      skipped.push({ matchId: id, reason: 'not_found' });
      continue;
    }
    if (m.tournament_id !== tournamentId) {
      skipped.push({ matchId: id, reason: 'wrong_tournament' });
      continue;
    }
    if (m.stage_id === targetStageId) {
      skipped.push({ matchId: id, reason: 'already_in_target_stage' });
      continue;
    }
    if (m.status === 'disputed') {
      skipped.push({ matchId: id, reason: 'match_disputed' });
      continue;
    }
    if (m.next_match_win_id || m.next_match_lose_id) {
      // Pour eviter de casser le bracket, on refuse les matchs avec des liens
      // de propagation actifs. L'admin doit d'abord defaire les liens.
      skipped.push({ matchId: id, reason: 'has_bracket_links' });
      continue;
    }

    const { error: updErr } = await supabaseAdmin
      .from('matches')
      .update({
        stage_id: targetStageId,
        // Reset group_key (l'assignation depend du stage cible).
        group_key: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (updErr) {
      skipped.push({ matchId: id, reason: 'update_failed' });
      continue;
    }
    moved.push(id);
  }

  if (ctx?.staff?.id && moved.length > 0) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'staff_batch_action',
        entity_type: 'match',
        entity_id: targetStageId,
        tournament_id: tournamentId,
        payload: {
          action: 'reassign_stage',
          target_stage_id: targetStageId,
          moved_count: moved.length,
          moved_ids: moved,
          skipped,
        },
      });
    } catch (e) {
      logger.error('reassign_stage logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    mode: 'reassign_stage',
    moved,
    skipped,
    targetStageId,
  });
}
