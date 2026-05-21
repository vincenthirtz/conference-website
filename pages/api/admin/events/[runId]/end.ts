// pages/api/admin/events/[runId]/end.ts
//
// Feature: Run-of-show — Lot 2.
// POST : passe l'event_run de 'live' a 'done', set ended_at = now(). Marque
// tous les segments non-done en done (ended_at = now() pour les segments
// 'live', les 'upcoming' deviennent 'done' sans timestamps de jeu — c'est un
// state "le run est fini, peu importe ce qui restait").
//
// Idempotent : si deja done → no-op 200. Si draft → 409 (un draft ne peut pas
// se finir sans avoir commence).

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
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'admin-events-end')
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
    .select('id, status, started_at, ended_at, tenant_id')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[admin/events/end] lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) return res.status(404).json({ error: 'Event run not found.' });

  if (run.status === 'done') {
    return res.status(200).json({ run, alreadyEnded: true });
  }
  if (run.status === 'draft') {
    return res.status(409).json({
      error:
        "Ce run n'a jamais ete demarre (status=draft). Utilise /start avant /end.",
      code: 'RUN_NOT_STARTED',
    });
  }

  const now = new Date().toISOString();

  // 1) Cloturer les segments live (set ended_at = now).
  await admin
    .from('event_segments')
    .update({ status: 'done', ended_at: now })
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'live');

  // 2) Forcer en 'done' tous les segments upcoming (le run est fini, on ne
  //    joue plus rien). Pas de ended_at sur ces segments — ils n'ont jamais
  //    tourne.
  await admin
    .from('event_segments')
    .update({ status: 'done' })
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'upcoming');

  // 3) Marquer le run done.
  const { data: updated, error: updErr } = await admin
    .from('event_runs')
    .update({ status: 'done', ended_at: now })
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'live')
    .select(
      'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at'
    )
    .maybeSingle();

  if (updErr) {
    logger.error('[admin/events/end] update error', updErr);
    return res.status(500).json({ error: 'Failed to end event run.' });
  }

  if (!updated) {
    const { data: refreshed } = await admin
      .from('event_runs')
      .select(
        'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at'
      )
      .eq('id', runId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    return res.status(200).json({ run: refreshed, alreadyEnded: true });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'event_run',
      entity_id: runId,
      tenant_id: ctx.tenantId,
      payload: { action: 'end_event_run', endedAt: now },
    });
  }

  return res.status(200).json({ run: updated, alreadyEnded: false });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-end' }),
  'admin'
);
