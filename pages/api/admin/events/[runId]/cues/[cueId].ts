// pages/api/admin/events/[runId]/cues/[cueId].ts
//
// Feature: Run-of-show — rétractation d'un cue (anti-erreur live).
//
// DELETE : rétracte (soft-delete) un cue déjà envoyé.
//   - N'efface PAS la row : pose retracted_at=now() + retracted_by_user_id.
//     Le caster reçoit un realtime UPDATE (pas DELETE) et voit le cue passer
//     à l'état « Annulé » — pas une disparition silencieuse. Un cue urgent
//     rétracté sort de pendingUrgent côté cockpit → la modal bloquante se
//     ferme d'elle-même.
//   - Idempotent : un cue déjà rétracté renvoie 200 avec le cue inchangé
//     (alreadyRetracted=true). Pas besoin d'Idempotency-Key (la rétractation
//     est naturellement idempotente, contrairement au CREATE).
//   - Tenant scope strict. Le run doit exister et appartenir au tenant ; on ne
//     gate PAS sur status='live' : rétracter reste possible juste après la fin
//     d'un run (correction a posteriori).
//
// Conventions :
//   - withStaffRoute(handler, 'admin') (même seuil que create/start/end run).
//   - supabaseAdmin (bypass RLS strict default-deny de event_cues).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const CUE_SELECT =
  'id, event_run_id, severity, body, created_by_user_id, created_at, expires_at, dedup_key, retracted_at, retracted_by_user_id';

async function deleteHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  runId: string,
  cueId: string
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'admin-cue-retract')
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  // Le cue doit exister, appartenir au tenant ET au run de l'URL.
  const { data: cue, error: cueErr } = await admin
    .from('event_cues')
    .select(CUE_SELECT)
    .eq('id', cueId)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (cueErr) {
    logger.error('[admin/cues/retract] lookup error', cueErr);
    return res.status(500).json({ error: 'Failed to load cue.' });
  }
  if (!cue) {
    return res.status(404).json({ error: 'Cue not found.' });
  }

  // Idempotent : déjà rétracté → no-op, on renvoie le cue tel quel.
  if (cue.retracted_at) {
    return res.status(200).json({ cue, alreadyRetracted: true });
  }

  const { data: updated, error: updErr } = await admin
    .from('event_cues')
    .update({
      retracted_at: new Date().toISOString(),
      retracted_by_user_id: ctx.user?.id ?? null,
    })
    .eq('id', cueId)
    .eq('tenant_id', ctx.tenantId)
    .select(CUE_SELECT)
    .single();

  if (updErr || !updated) {
    logger.error('[admin/cues/retract] update error', updErr);
    return res.status(500).json({ error: 'Failed to retract cue.' });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'event_cue',
      entity_id: cueId,
      tenant_id: ctx.tenantId,
      payload: {
        action: 'retract_event_cue',
        runId,
        severity: updated.severity,
      },
    });
  }

  return res.status(200).json({ cue: updated });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { runId, cueId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }
  if (!cueId || Array.isArray(cueId) || !isValidUUID(cueId)) {
    return res.status(400).json({ error: 'Invalid cueId.' });
  }

  if (req.method === 'DELETE') {
    return deleteHandler(req, res, ctx, runId, cueId);
  }

  res.setHeader('Allow', 'DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
