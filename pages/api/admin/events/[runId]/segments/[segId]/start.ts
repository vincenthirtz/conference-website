// pages/api/admin/events/[runId]/segments/[segId]/start.ts
//
// Feature: Run-of-show — Lot 2.
// POST : passe le segment de 'upcoming' a 'live', set started_at = now().
// Invariant metier : un seul segment peut etre live a la fois dans un run.
// Tout autre segment 'live' du meme run est automatiquement marque 'done'
// (avec ended_at = now() s'il n'en avait pas).
//
// Emet un event `event_segment.transitioned` dans bot_event_outbox pour
// fan-out Discord/PWA/email.
//
// Idempotent : si deja live → no-op 200 + on emet PAS un nouvel event
// (eviter les doublons d'annonce). Si done ou skipped → 409.

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
      'admin-events-seg-start'
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
      'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, tenant_id'
    )
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (segErr) {
    logger.error('[admin/events/seg/start] lookup error', segErr);
    return res.status(500).json({ error: 'Failed to load segment.' });
  }
  if (!segment) {
    return res.status(404).json({ error: 'Segment not found.' });
  }

  if (segment.status === 'live') {
    return res.status(200).json({ segment, alreadyStarted: true });
  }
  if (segment.status !== 'upcoming') {
    return res.status(409).json({
      error: `Le segment est en status '${segment.status}', impossible de le demarrer.`,
      code: 'SEGMENT_NOT_UPCOMING',
      status: segment.status,
    });
  }

  const now = new Date().toISOString();

  // Cloturer les segments live autres dans le meme run (invariant 1-seul-live).
  await admin
    .from('event_segments')
    .update({ status: 'done', ended_at: now })
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'live')
    .neq('id', segId);

  // Promotion du segment cible. Optimistic guard sur status='upcoming'.
  const { data: updated, error: updErr } = await admin
    .from('event_segments')
    .update({ status: 'live', started_at: now })
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'upcoming')
    .select(
      'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
    )
    .maybeSingle();

  if (updErr) {
    logger.error('[admin/events/seg/start] update error', updErr);
    return res.status(500).json({ error: 'Failed to start segment.' });
  }
  if (!updated) {
    // Race : un autre client a deja transitionne le status.
    const { data: refreshed } = await admin
      .from('event_segments')
      .select(
        'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
      )
      .eq('id', segId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    return res.status(200).json({ segment: refreshed, alreadyStarted: true });
  }

  // Emet l'event outbox pour fan-out bot. Best-effort : on log mais on
  // n'echoue pas la requete si l'outbox plante.
  void emitSegmentTransitioned({
    runId: runId as string,
    segmentId: segId as string,
    fromStatus: 'upcoming',
    toStatus: 'live',
    tenantId: ctx.tenantId,
    broadcastMessage: segment.broadcast_message ?? null,
    segment: {
      ord: segment.ord as number,
      type: segment.type as string,
      title: segment.title as string,
      durationMin: (segment.duration_min as number | null) ?? null,
      matchId: (segment.match_id as string | null) ?? null,
    },
  }).catch((e) =>
    logger.error('[admin/events/seg/start] outbox emit error', e)
  );

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'event_segment',
      entity_id: segId,
      tenant_id: ctx.tenantId,
      payload: { action: 'start_event_segment', runId, ord: segment.ord },
    });
  }

  return res.status(200).json({ segment: updated, alreadyStarted: false });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-seg-start' }),
  'manager'
);
