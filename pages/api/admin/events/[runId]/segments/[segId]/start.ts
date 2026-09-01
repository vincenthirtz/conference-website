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
import { transitionToSegment } from '@/utils/broadcast/segmentTransition';

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

  const result = await transitionToSegment(admin, {
    runId,
    tenantId: ctx.tenantId,
    segId,
  });

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return res.status(404).json({ error: 'Segment not found.' });
    }
    if (result.reason === 'not_upcoming') {
      return res.status(409).json({
        error: `Le segment est en status '${result.status}', impossible de le demarrer.`,
        code: 'SEGMENT_NOT_UPCOMING',
        status: result.status,
      });
    }
    logger.error('[admin/events/seg/start] transition error', result.error);
    return res.status(500).json({ error: 'Failed to start segment.' });
  }

  if (result.alreadyStarted) {
    return res
      .status(200)
      .json({ segment: result.segment, alreadyStarted: true });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'event_segment_manage',
      entity_type: 'event_segment',
      entity_id: segId,
      tenant_id: ctx.tenantId,
      payload: {
        action: 'start_event_segment',
        runId,
        ord: (result.segment as { ord?: number }).ord ?? null,
      },
    });
  }

  return res
    .status(200)
    .json({ segment: result.segment, alreadyStarted: false });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-seg-start' }),
  { permission: 'manage_broadcast' }
);
