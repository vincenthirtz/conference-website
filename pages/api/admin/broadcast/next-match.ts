// pages/api/admin/broadcast/next-match.ts
//
// Feature: Production broadcast automatisée (roadmap #07).
//
// POST : one-click "next match". Resolves the tenant's live run + its current
// live segment, finds the next `type='match'` segment by ord (skipping breaks/
// intros/outros), and performs the atomic single-live-segment swap — reusing
// the SAME implementation as segments/[segId]/start.ts
// (utils/broadcast/segmentTransition.ts). Optionally resets the overlay scene
// to 'starting' so the automated director picks up the new match cleanly.
//
// 409s: NO_LIVE_RUN (no live run), NO_CURRENT_SEGMENT (run has no live
// segment), NO_NEXT_MATCH (no upcoming match segment after the current one).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  fetchLiveBroadcastState,
  setBroadcastScene,
} from '@/utils/broadcast/liveState';
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
      'admin-broadcast-next-match'
    )
  )
    return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Enchaîner sur le match suivant en un clic, c'est la direction automatique :
  // même capacité de palier que la console de régie.
  const denial = await capabilityDenial(
    ctx.tenantId,
    'broadcastStudio',
    'La régie vidéo (direction automatique et overlays OBS) fait partie de l’offre Éditeur, sur devis.'
  );
  if (denial) return res.status(402).json(denial);

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  // Resolve the live run + current live segment (tenant-scoped).
  const live = await fetchLiveBroadcastState(ctx.tenantId);
  if (!live.run) {
    return res.status(409).json({
      error: 'No live event_run for this tenant. Start a run first.',
      code: 'NO_LIVE_RUN',
    });
  }
  if (!live.currentSegment) {
    return res.status(409).json({
      error: 'The live run has no current (live) segment.',
      code: 'NO_CURRENT_SEGMENT',
    });
  }

  const runId = live.run.id;
  const currentOrd = live.currentSegment.ord;

  // Next UPCOMING match segment strictly after the current one (skip breaks/
  // intros/outros and anything already done/skipped).
  const { data: candidates, error: nextErr } = await admin
    .from('event_segments')
    .select('id, ord, type, status, match_id, title')
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .eq('type', 'match')
    .eq('status', 'upcoming')
    .gt('ord', currentOrd)
    .order('ord', { ascending: true })
    .limit(1);

  if (nextErr) {
    logger.error('[admin/broadcast/next-match] lookup error', nextErr);
    return res.status(500).json({ error: 'Failed to resolve next match.' });
  }

  const next = (candidates ?? [])[0] as { id: string; ord: number } | undefined;
  if (!next) {
    return res.status(409).json({
      error: 'No upcoming match segment after the current one.',
      code: 'NO_NEXT_MATCH',
    });
  }

  // Atomic swap — closes the current live segment, promotes the target. Emits
  // event_segment.transitioned (same as start.ts).
  const result = await transitionToSegment(admin, {
    runId,
    tenantId: ctx.tenantId,
    segId: next.id,
  });

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return res.status(404).json({ error: 'Next segment not found.' });
    }
    if (result.reason === 'not_upcoming') {
      // Race: another client already transitioned the target.
      return res.status(409).json({
        error: `Le segment cible est en status '${result.status}'.`,
        code: 'SEGMENT_NOT_UPCOMING',
        status: result.status,
      });
    }
    logger.error('[admin/broadcast/next-match] transition error', result.error);
    return res.status(500).json({ error: 'Failed to switch to next match.' });
  }

  // Reset the overlay to the pre-match "starting" scene; the auto-director will
  // flip it to 'match' when the match goes ongoing. Best-effort.
  await setBroadcastScene(admin, runId, 'starting').catch((e) =>
    logger.error('[admin/broadcast/next-match] setBroadcastScene error', e)
  );

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'event_segment',
      entity_id: next.id,
      tenant_id: ctx.tenantId,
      payload: {
        action: 'broadcast_next_match',
        runId,
        fromOrd: currentOrd,
        toOrd: next.ord,
      },
    });
  }

  return res.status(200).json({
    segment: result.segment,
    alreadyStarted: result.alreadyStarted,
    runId,
  });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-broadcast-next-match' }),
  { permission: 'manage_broadcast' }
);
