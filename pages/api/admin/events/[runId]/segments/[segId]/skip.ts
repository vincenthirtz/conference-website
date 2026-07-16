// pages/api/admin/events/[runId]/segments/[segId]/skip.ts
//
// Feature: Run-of-show — Lot 2.
// POST : passe le segment de 'upcoming' a 'skipped'. Pas de started_at /
// ended_at — le segment n'a jamais tourne.
//
// Idempotent : si deja skipped → no-op 200. Si live ou done → 409.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { emitSegmentTransitioned } from '@/utils/eventSegmentEvents';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-events-seg-skip'
    )
  )
    return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { runId, segId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }
  if (!segId || Array.isArray(segId) || !isValidUUID(segId)) {
    return res.status(400).json({ error: 'Invalid segId.' });
  }

  const { data: segment, error: segErr } = await admin
    .from('event_segments')
    .select(
      'id, ord, type, match_id, title, duration_min, status, broadcast_message, tenant_id'
    )
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (segErr) {
    logger.error('[admin/events/seg/skip] lookup error', segErr);
    return res.status(500).json({ error: 'Failed to load segment.' });
  }
  if (!segment) {
    return res.status(404).json({ error: 'Segment not found.' });
  }

  if (segment.status === 'skipped') {
    return res.status(200).json({ segment, alreadySkipped: true });
  }
  if (segment.status !== 'upcoming') {
    return res.status(409).json({
      error: `Le segment est en status '${segment.status}', impossible de le skipper.`,
      code: 'SEGMENT_NOT_UPCOMING',
      status: segment.status,
    });
  }

  const { data: updated, error: updErr } = await admin
    .from('event_segments')
    .update({ status: 'skipped' })
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'upcoming')
    .select(
      'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
    )
    .maybeSingle();

  if (updErr) {
    logger.error('[admin/events/seg/skip] update error', updErr);
    return res.status(500).json({ error: 'Failed to skip segment.' });
  }
  if (!updated) {
    const { data: refreshed } = await admin
      .from('event_segments')
      .select(
        'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
      )
      .eq('id', segId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    return res.status(200).json({ segment: refreshed, alreadySkipped: true });
  }

  void emitSegmentTransitioned({
    runId: runId as string,
    segmentId: segId as string,
    fromStatus: 'upcoming',
    toStatus: 'skipped',
    tenantId: ctx.tenantId,
    broadcastMessage: segment.broadcast_message ?? null,
    segment: {
      ord: segment.ord as number,
      type: segment.type as string,
      title: segment.title as string,
      durationMin: (segment.duration_min as number | null) ?? null,
      matchId: (segment.match_id as string | null) ?? null,
    },
  }).catch((e) => logger.error('[admin/events/seg/skip] outbox emit error', e));

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'event_segment',
      entity_id: segId,
      tenant_id: ctx.tenantId,
      payload: { action: 'skip_event_segment', runId, ord: segment.ord },
    });
  }

  return res.status(200).json({ segment: updated, alreadySkipped: false });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-seg-skip' }),
  'admin'
);
