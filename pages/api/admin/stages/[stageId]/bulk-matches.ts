// pages/api/admin/stages/[stageId]/bulk-matches.ts
// Admin: opérations en masse sur les matchs d'une phase
// - PATCH  : planification en masse (scheduled_at pour plusieurs matchs)
// - PUT    : édition en masse (status, best_of, round_number, notes…)
// - DELETE : suppression/annulation en masse

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'stage-bulk-matches' }),
  'admin'
);

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  // Vérifier que la phase existe
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  try {
    switch (req.method) {
      case 'POST':
        return await handleBulkUndo(
          stageId,
          stage.tournament_id,
          req,
          res,
          ctx
        );
      case 'PATCH':
        return await handleBulkSchedule(
          stageId,
          stage.tournament_id,
          req,
          res,
          ctx
        );
      case 'PUT':
        return await handleBulkUpdate(
          stageId,
          stage.tournament_id,
          req,
          res,
          ctx
        );
      case 'DELETE':
        return await handleBulkDelete(
          stageId,
          stage.tournament_id,
          req,
          res,
          ctx
        );
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/stages/[stageId]/bulk-matches] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
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
  ctx: AuthenticatedStaffContext
) {
  const { schedules } = req.body;

  if (!Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({
      error: "Body must include non-empty array 'schedules'",
    });
  }

  const results: Array<{ matchId: string; success: boolean; error?: string }> =
    [];
  // Track successful updates so we can rollback on partial failure if requested
  const succeeded: Array<{
    matchId: string;
    previousScheduledAt: string | null;
  }> = [];

  // Snapshot current scheduled_at values for rollback capability
  const validMatchIds = schedules
    .filter((e: any) => e.matchId && typeof e.matchId === 'string')
    .map((e: any) => e.matchId);

  const { data: snapshots } =
    validMatchIds.length > 0
      ? await supabaseAdmin
          .from('matches')
          .select('id, scheduled_at')
          .eq('tenant_id', ctx.tenantId)
          .eq('stage_id', stageId)
          .in('id', validMatchIds)
      : { data: [] };

  const snapshotMap = new Map(
    (snapshots || []).map((s: any) => [s.id, s.scheduled_at])
  );

  for (const entry of schedules) {
    if (!entry.matchId || typeof entry.matchId !== 'string') {
      results.push({
        matchId: entry.matchId,
        success: false,
        error: 'Invalid matchId',
      });
      continue;
    }

    const { error } = await supabaseAdmin
      .from('matches')
      .update({ scheduled_at: entry.scheduled_at ?? null })
      .eq('id', entry.matchId)
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', stageId);

    if (error) {
      results.push({
        matchId: entry.matchId,
        success: false,
        error: 'Database update failed',
      });

      // Rollback all previously successful updates in this batch
      if (succeeded.length > 0) {
        for (const prev of succeeded) {
          await supabaseAdmin
            .from('matches')
            .update({ scheduled_at: prev.previousScheduledAt })
            .eq('id', prev.matchId)
            .eq('tenant_id', ctx.tenantId)
            .eq('stage_id', stageId);
        }
        return res.status(500).json({
          error: `Partial failure at match ${entry.matchId}. All ${succeeded.length} previous updates have been rolled back.`,
          failedMatchId: entry.matchId,
        });
      }
    } else {
      succeeded.push({
        matchId: entry.matchId,
        previousScheduledAt: snapshotMap.get(entry.matchId) ?? null,
      });
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

  // Build undo payload so the client can revert this operation
  const undoPayload = {
    type: 'bulk_schedule' as const,
    snapshots: succeeded.map((s) => ({
      matchId: s.matchId,
      fields: { scheduled_at: s.previousScheduledAt },
    })),
  };

  return res.status(200).json({ results, successCount, undoPayload });
}

/* -----------------------------------------------------------
 * PUT : édition en masse (status, best_of, round_number, notes…)
 *
 * Body :
 *  { matchIds: string[], fields: { status?, best_of?, round_number?, notes?, stream_url?, lobby_code? } }
 * ---------------------------------------------------------*/

const VALID_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'postponed',
  'disputed',
  'walkover',
];
const BULK_EDITABLE_FIELDS = [
  'status',
  'best_of',
  'round_number',
  'notes',
  'stream_url',
  'lobby_code',
] as const;

async function handleBulkUpdate(
  stageId: string,
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { matchIds, fields } = req.body;

  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return res
      .status(400)
      .json({ error: "Body must include non-empty array 'matchIds'" });
  }

  if (
    !fields ||
    typeof fields !== 'object' ||
    Object.keys(fields).length === 0
  ) {
    return res
      .status(400)
      .json({ error: "Body must include non-empty object 'fields'" });
  }

  // Build update payload with only allowed fields
  const updatePayload: Record<string, unknown> = {};

  for (const key of BULK_EDITABLE_FIELDS) {
    if (key in fields) {
      updatePayload[key] = fields[key];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({
      error: `No valid fields. Allowed: ${BULK_EDITABLE_FIELDS.join(', ')}`,
    });
  }

  // Validate status
  if (
    'status' in updatePayload &&
    !VALID_STATUSES.includes(updatePayload.status as string)
  ) {
    return res.status(400).json({
      error: `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`,
    });
  }

  // Validate best_of
  if ('best_of' in updatePayload && updatePayload.best_of !== null) {
    const bo = Number(updatePayload.best_of);
    if (!Number.isInteger(bo) || bo < 1 || bo > 15) {
      return res
        .status(400)
        .json({ error: 'best_of must be an integer between 1 and 15' });
    }
    updatePayload.best_of = bo;
  }

  // Snapshot current values for undo
  const fieldKeys = Object.keys(updatePayload);
  const selectFields = ['id', ...fieldKeys].join(', ');
  const { data: snapshotRows } = await supabaseAdmin
    .from('matches')
    .select(selectFields)
    .eq('tenant_id', ctx.tenantId)
    .eq('stage_id', stageId)
    .in('id', matchIds);

  const { error, count } = await supabaseAdmin
    .from('matches')
    .update(updatePayload)
    .eq('tenant_id', ctx.tenantId)
    .eq('stage_id', stageId)
    .in('id', matchIds);

  if (error) {
    logger.error('bulk update matches error:', error);
    return res.status(500).json({ error: 'Failed to update matches' });
  }

  // Build undo payload from snapshots
  const undoPayload = {
    type: 'bulk_update' as const,
    snapshots: (snapshotRows || []).map((row: any) => {
      const fields: Record<string, unknown> = {};
      for (const k of fieldKeys) {
        fields[k] = row[k] ?? null;
      }
      return { matchId: row.id as string, fields };
    }),
  };

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'staff_batch_action',
      entity_type: 'match',
      entity_id: stageId,
      tournament_id: tournamentId,
      payload: {
        action: 'bulk_update',
        matchIds,
        fields: updatePayload,
        count: matchIds.length,
      },
    });
  }

  return res.status(200).json({
    success: true,
    count: count ?? matchIds.length,
    fields: updatePayload,
    undoPayload,
  });
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
  ctx: AuthenticatedStaffContext
) {
  const { matchIds, hard = false } = req.body;

  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return res.status(400).json({
      error: "Body must include non-empty array 'matchIds'",
    });
  }

  // Snapshot for undo (only useful for soft cancel, hard delete is irreversible)
  let undoPayload: {
    type: string;
    snapshots: { matchId: string; fields: Record<string, unknown> }[];
  } | null = null;

  if (!hard) {
    const { data: snapshotRows } = await supabaseAdmin
      .from('matches')
      .select('id, status, team1_score, team2_score, winner_team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', stageId)
      .in('id', matchIds);

    undoPayload = {
      type: 'bulk_cancel',
      snapshots: (snapshotRows || []).map((row: any) => ({
        matchId: row.id as string,
        fields: {
          status: row.status,
          team1_score: row.team1_score,
          team2_score: row.team2_score,
          winner_team_id: row.winner_team_id,
        },
      })),
    };
  }

  if (hard) {
    const { error } = await supabaseAdmin
      .from('matches')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', stageId)
      .in('id', matchIds);

    if (error) {
      logger.error('bulk hard delete matches error:', error);
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
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', stageId)
      .in('id', matchIds);

    if (error) {
      logger.error('bulk cancel matches error:', error);
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
    ...(undoPayload ? { undoPayload } : {}),
  });
}

/* -----------------------------------------------------------
 * POST : annulation (undo) d'une opération batch
 *
 * Body :
 *  {
 *    action: "undo",
 *    undoPayload: {
 *      type: "bulk_schedule" | "bulk_update" | "bulk_cancel",
 *      snapshots: Array<{ matchId: string, fields: Record<string, unknown> }>
 *    }
 *  }
 *
 * Restaure les valeurs précédentes pour chaque match.
 * ---------------------------------------------------------*/

async function handleBulkUndo(
  stageId: string,
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { action, undoPayload } = req.body;

  if (action !== 'undo') {
    return res
      .status(400)
      .json({ error: "POST body must include action: 'undo'" });
  }

  if (
    !undoPayload ||
    !undoPayload.type ||
    !Array.isArray(undoPayload.snapshots) ||
    undoPayload.snapshots.length === 0
  ) {
    return res.status(400).json({
      error:
        'Body must include undoPayload with type and non-empty snapshots array',
    });
  }

  const snapshots: Array<{ matchId: string; fields: Record<string, unknown> }> =
    undoPayload.snapshots;

  const results: Array<{ matchId: string; success: boolean; error?: string }> =
    [];

  for (const snap of snapshots) {
    if (!snap.matchId || typeof snap.matchId !== 'string' || !snap.fields) {
      results.push({
        matchId: snap.matchId,
        success: false,
        error: 'Invalid snapshot entry',
      });
      continue;
    }

    const { error } = await supabaseAdmin
      .from('matches')
      .update(snap.fields)
      .eq('id', snap.matchId)
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', stageId);

    if (error) {
      results.push({
        matchId: snap.matchId,
        success: false,
        error: 'Database update failed',
      });
    } else {
      results.push({ matchId: snap.matchId, success: true });
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
        action: 'bulk_undo',
        originalType: undoPayload.type,
        count: snapshots.length,
        successCount,
      },
    });
  }

  return res
    .status(200)
    .json({ success: successCount > 0, results, successCount });
}
