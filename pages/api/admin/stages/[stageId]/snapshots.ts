// pages/api/admin/stages/[stageId]/snapshots.ts
//
// - GET  : liste les snapshots du stage (paginé par taken_at DESC)
// - POST : crée un snapshot manuel { reason? } (rollback ad-hoc admin)
// - PATCH: restaure un snapshot { snapshotId } → admin only

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  AuthenticatedStaffContext,
  hasAtLeastRole,
} from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { invalidateStandingsCache } from '@/utils/stages/standingsCache';
import {
  createBracketSnapshot,
  restoreBracketSnapshot,
} from '@/utils/bracket/snapshot';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'stage-bracket-snapshots' }),
  'admin'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  const stageIdStr = String(stageId);

  // Vérifier que le stage existe (FK CASCADE protège déjà côté DB mais
  // on veut un 404 propre côté UI).
  const { data: stage } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id, name')
    .eq('id', stageIdStr)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!stage) {
    return res.status(404).json({ error: 'Stage introuvable.' });
  }

  switch (req.method) {
    case 'GET':
      return handleList(req, res, stageIdStr, ctx);
    case 'POST':
      return handleCreate(req, res, stageIdStr, stage.tournament_id, ctx);
    case 'PATCH':
      return handleRestore(req, res, stageIdStr, stage.tournament_id, ctx);
    default:
      res.setHeader('Allow', 'GET,POST,PATCH');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleList(
  req: NextApiRequest,
  res: NextApiResponse,
  stageId: string,
  ctx: AuthenticatedStaffContext
) {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const { data, error } = await supabaseAdmin!
    .from('bracket_snapshots')
    .select(
      `id, stage_id, taken_at, taken_by_staff_id, reason, match_count,
       staff:staff!bracket_snapshots_taken_by_staff_id_fkey(id, display_name, role)`
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('stage_id', stageId)
    .order('taken_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('[admin/stages/snapshots] list error', error);
    return res
      .status(500)
      .json({ error: 'Erreur lors du chargement des snapshots.' });
  }
  return res.status(200).json({ snapshots: data ?? [] });
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  stageId: string,
  tournamentId: string | null,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as { reason?: unknown };
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 200)
      : 'manual';

  const result = await createBracketSnapshot({
    stageId,
    reason,
    staffId: ctx.staff.id,
    tenantId: ctx.tenantId,
  });
  if (!result) {
    return res
      .status(500)
      .json({ error: 'Échec de la création du snapshot.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'stage',
    entity_id: stageId,
    tournament_id: tournamentId,
    payload: {
      subject: 'bracket_snapshot_created',
      snapshot_id: result.id,
      match_count: result.matchCount,
      reason,
    },
  });

  return res.status(201).json({
    snapshotId: result.id,
    matchCount: result.matchCount,
  });
}

async function handleRestore(
  req: NextApiRequest,
  res: NextApiResponse,
  stageId: string,
  tournamentId: string | null,
  ctx: AuthenticatedStaffContext
) {
  // Restore = action destructive, admin+ only (pas manager).
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res
      .status(403)
      .json({ error: 'Seul un admin peut restaurer un snapshot.' });
  }

  const body = (req.body ?? {}) as { snapshotId?: unknown };
  const snapshotId =
    typeof body.snapshotId === 'number' && Number.isInteger(body.snapshotId)
      ? body.snapshotId
      : null;
  if (!snapshotId || snapshotId <= 0) {
    return res.status(400).json({ error: 'snapshotId (integer) requis.' });
  }

  // Vérifier que le snapshot appartient bien au stage
  const { data: snap } = await supabaseAdmin!
    .from('bracket_snapshots')
    .select('id, stage_id, taken_at, reason, match_count')
    .eq('id', snapshotId)
    .eq('stage_id', stageId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!snap) {
    return res
      .status(404)
      .json({ error: 'Snapshot introuvable pour ce stage.' });
  }

  // Auto-snapshot AVANT restore pour permettre un "annule la restore".
  // Best-effort.
  await createBracketSnapshot({
    stageId,
    reason: 'pre_restore',
    staffId: ctx.staff.id,
    tenantId: ctx.tenantId,
  }).catch((e) =>
    logger.error('[snapshots/restore] pre_restore snapshot failed', e)
  );

  const result = await restoreBracketSnapshot(snapshotId);
  if (!result) {
    return res
      .status(500)
      .json({ error: 'Échec de la restauration du snapshot.' });
  }

  // Invalide le cache standings : les scores/winners ont potentiellement
  // changé en grand nombre.
  invalidateStandingsCache(stageId);

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'stage',
    entity_id: stageId,
    tournament_id: tournamentId,
    payload: {
      subject: 'bracket_snapshot_restored',
      snapshot_id: snapshotId,
      restored: result.restored,
      missing: result.missing,
      snapshot_reason: snap.reason,
      snapshot_taken_at: snap.taken_at,
    },
  });

  return res.status(200).json({
    success: true,
    restored: result.restored,
    missing: result.missing,
  });
}
