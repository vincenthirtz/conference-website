// pages/api/admin/stages/[stageId]/bulk-matches.ts
// Admin: opérations en masse sur les matchs d'une phase
// - PATCH  : planification en masse (scheduled_at pour plusieurs matchs)
// - DELETE : suppression/annulation en masse

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  // Vérifier que la phase existe
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  try {
    switch (req.method) {
      case 'PATCH':
        return await handleBulkSchedule(stageId, stage.tournament_id, req, res, ctx);
      case 'DELETE':
        return await handleBulkDelete(stageId, stage.tournament_id, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: any) {
    console.error('[/api/admin/stages/[stageId]/bulk-matches] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * PATCH : planification en masse
 *
 * Body :
 *  { schedules: Array<{ matchId: string, scheduled_at: string | null }> }
 * ---------------------------------------------------------*/

async function handleBulkSchedule(
  stageId: string,
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { schedules } = req.body;

  if (!Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({
      error: "Body must include non-empty array 'schedules'",
    });
  }

  const results: Array<{ matchId: string; success: boolean; error?: string }> = [];

  for (const entry of schedules) {
    if (!entry.matchId || typeof entry.matchId !== 'string') {
      results.push({ matchId: entry.matchId, success: false, error: 'Invalid matchId' });
      continue;
    }

    const { error } = await supabaseAdmin
      .from('matches')
      .update({ scheduled_at: entry.scheduled_at ?? null })
      .eq('id', entry.matchId)
      .eq('stage_id', stageId);

    if (error) {
      results.push({ matchId: entry.matchId, success: false, error: error.message });
    } else {
      results.push({ matchId: entry.matchId, success: true });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'staff_batch_action',
      entity_type: 'match',
      entity_id: stageId,
      tournament_id: tournamentId,
      payload: {
        action: 'bulk_schedule',
        count: schedules.length,
        successCount,
        schedules,
      },
    });
  }

  return res.status(200).json({ results, successCount });
}

/* -----------------------------------------------------------
 * DELETE : suppression/annulation en masse
 *
 * Body :
 *  { matchIds: string[], hard?: boolean }
 *
 * hard=false (défaut) : status → "cancelled" + reset scores
 * hard=true           : suppression définitive de la base
 * ---------------------------------------------------------*/

async function handleBulkDelete(
  stageId: string,
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { matchIds, hard = false } = req.body;

  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return res.status(400).json({
      error: "Body must include non-empty array 'matchIds'",
    });
  }

  if (hard) {
    const { error } = await supabaseAdmin
      .from('matches')
      .delete()
      .eq('stage_id', stageId)
      .in('id', matchIds);

    if (error) {
      console.error('bulk hard delete matches error:', error);
      return res.status(500).json({ error: 'Failed to delete matches' });
    }
  } else {
    const { error } = await supabaseAdmin
      .from('matches')
      .update({
        status: 'cancelled',
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
      })
      .eq('stage_id', stageId)
      .in('id', matchIds);

    if (error) {
      console.error('bulk cancel matches error:', error);
      return res.status(500).json({ error: 'Failed to cancel matches' });
    }
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'staff_batch_action',
      entity_type: 'match',
      entity_id: stageId,
      tournament_id: tournamentId,
      payload: {
        action: hard ? 'bulk_hard_delete' : 'bulk_cancel',
        matchIds,
        count: matchIds.length,
      },
    });
  }

  return res.status(200).json({
    success: true,
    count: matchIds.length,
    hard,
  });
}
