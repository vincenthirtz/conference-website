// pages/api/admin/events/[runId]/start.ts
//
// Feature: Run-of-show — Lot 2.
// POST : passe l'event_run de 'draft' a 'live', set started_at = now().
//
// Idempotent : si deja live → no-op 200 ; si done → 409 (impossible de rouvrir
// un run termine via cet endpoint, il faudra le recreer ou ajouter un /reopen
// dedie plus tard).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

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
      'admin-events-start'
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

  const { runId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }

  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select(
      'id, status, started_at, ended_at, name, slug, scheduled_at, description, tenant_id'
    )
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[admin/events/start] lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) return res.status(404).json({ error: 'Event run not found.' });

  // Idempotent : si deja live, on renvoie le run tel quel.
  if (run.status === 'live') {
    return res.status(200).json({ run, alreadyStarted: true });
  }
  if (run.status === 'done') {
    return res.status(409).json({
      error:
        'Ce run est marque "done" — impossible de le redemarrer via cet endpoint.',
      code: 'RUN_ALREADY_DONE',
    });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from('event_runs')
    .update({ status: 'live', started_at: now })
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'draft') // optimistic guard contre les races
    .select(
      'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at'
    )
    .maybeSingle();

  if (updErr) {
    logger.error('[admin/events/start] update error', updErr);
    return res.status(500).json({ error: 'Failed to start event run.' });
  }

  if (!updated) {
    // Race-condition : un autre client a deja change le status entre temps.
    // On refetch et on retourne l'etat courant.
    const { data: refreshed } = await admin
      .from('event_runs')
      .select(
        'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at'
      )
      .eq('id', runId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    return res.status(200).json({ run: refreshed, alreadyStarted: true });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'event_run',
      entity_id: runId,
      tenant_id: ctx.tenantId,
      payload: { action: 'start_event_run', startedAt: now },
    });
  }

  return res.status(200).json({ run: updated, alreadyStarted: false });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-start' }),
  'admin'
);
