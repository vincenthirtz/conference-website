// pages/api/admin/events/[runId]/waves/reorder.ts
//
// Feature: Waves + Stations (event director).
// POST : reorder des waves d'un event_run. Body `{ order: {id, ord}[] }`.
//
// Strategie identique a segments/reorder.ts : la contrainte UNIQUE
// (event_run_id, ord) empeche d'ecrire directement les ord cibles (collisions
// transitoires). supabase-js n'expose pas les transactions, donc on utilise la
// technique du "decalage temporaire" :
//   Phase 1 — ord = REORDER_OFFSET + i (hors de la plage cible 0..N).
//   Phase 2 — ord = <ord cible fourni par le client>.
// Robuste : un crash entre les deux phases laisse les ord uniques (juste
// decales), un /reorder ulterieur remet droit.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const REORDER_OFFSET = 1_000_000;

const WAVE_SELECT =
  'id, tenant_id, event_run_id, ord, title, planned_start_at, duration_min, status, started_at, ended_at, created_at, updated_at';

const ReorderSchema = z.object({
  order: z
    .array(
      z.object({
        id: z.string().uuid(),
        ord: z.number().int().nonnegative(),
      })
    )
    .min(1)
    .max(200),
});

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
      'admin-events-waves-reorder'
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

  const parsed = ReorderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { order } = parsed.data;

  const { data: run } = await admin
    .from('event_runs')
    .select('id, tenant_id')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!run) return res.status(404).json({ error: 'Event run not found.' });

  const { data: existing, error: fetchErr } = await admin
    .from('event_waves')
    .select('id')
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId);

  if (fetchErr) {
    logger.error('[admin/events/waves/reorder] fetch error', fetchErr);
    return res.status(500).json({ error: 'Failed to load waves.' });
  }

  const existingIds = new Set((existing ?? []).map((w) => w.id as string));
  const requestedIds = new Set(order.map((o) => o.id));
  const requestedOrds = new Set(order.map((o) => o.ord));

  if (requestedIds.size !== order.length) {
    return res.status(400).json({
      error: 'order contient des ids en double.',
      code: 'DUPLICATE_IDS',
    });
  }
  if (requestedOrds.size !== order.length) {
    return res.status(400).json({
      error: 'order contient des ord en double.',
      code: 'DUPLICATE_ORDS',
    });
  }
  for (const { id } of order) {
    if (!existingIds.has(id)) {
      return res.status(400).json({
        error: `La wave ${id} n'appartient pas a ce run.`,
        code: 'WAVE_NOT_IN_RUN',
        waveId: id,
      });
    }
  }
  if (requestedIds.size !== existingIds.size) {
    return res.status(400).json({
      error:
        'order doit contenir toutes les waves du run (aucune manquante, aucune en trop).',
      code: 'INCOMPLETE_REORDER',
      expected: existingIds.size,
      received: requestedIds.size,
    });
  }

  // Phase 1 : decaler tout hors de la plage cible.
  for (let i = 0; i < order.length; i++) {
    const { error: shiftErr } = await admin
      .from('event_waves')
      .update({ ord: REORDER_OFFSET + i })
      .eq('id', order[i].id)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId);
    if (shiftErr) {
      logger.error('[admin/events/waves/reorder] phase 1 error', shiftErr);
      return res.status(500).json({
        error: 'Failed to reorder waves (phase 1).',
        code: 'REORDER_PHASE1_FAILED',
      });
    }
  }

  // Phase 2 : ecrire les ord cibles fournis par le client.
  for (const { id, ord } of order) {
    const { error: setErr } = await admin
      .from('event_waves')
      .update({ ord })
      .eq('id', id)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId);
    if (setErr) {
      logger.error('[admin/events/waves/reorder] phase 2 error', setErr);
      return res.status(500).json({
        error:
          'Failed to reorder waves (phase 2). The waves may be in a transient shifted state — retry the reorder to fix.',
        code: 'REORDER_PHASE2_FAILED',
      });
    }
  }

  const { data: finalWaves } = await admin
    .from('event_waves')
    .select(WAVE_SELECT)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .order('ord', { ascending: true });

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'event_wave_manage',
      entity_type: 'event_run',
      entity_id: runId,
      tenant_id: ctx.tenantId,
      payload: { action: 'reorder_event_waves', order },
    });
  }

  return res.status(200).json({ success: true, waves: finalWaves ?? [] });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-waves-reorder' }),
  'admin'
);
