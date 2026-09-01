// pages/api/admin/events/[runId]/waves/[waveId]/index.ts
//
// Feature: Waves + Stations (event director).
// PATCH  : update partiel d'une wave. Transitions de statut auto-datent :
//          status='live'  + started_at null -> started_at = now()
//          status='done'  + ended_at   null -> ended_at   = now()
// DELETE : suppression hard. La FK event_segments.wave_id est ON DELETE SET NULL
//          (les segments rattaches voient wave_id remis a NULL).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const WAVE_SELECT =
  'id, tenant_id, event_run_id, ord, title, planned_start_at, duration_min, status, started_at, ended_at, created_at, updated_at';

const WaveStatusSchema = z.enum(['upcoming', 'live', 'done', 'skipped']);

const UpdateWaveSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    planned_start_at: z.string().datetime().nullable().optional(),
    duration_min: z.number().int().positive().nullable().optional(),
    status: WaveStatusSchema.optional(),
    started_at: z.string().datetime().nullable().optional(),
    ended_at: z.string().datetime().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit etre fourni.',
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
      { max: 60, windowMs: 60_000 },
      'admin-events-wave-id'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { runId, waveId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }
  if (!waveId || Array.isArray(waveId) || !isValidUUID(waveId)) {
    return res.status(400).json({ error: 'Invalid waveId.' });
  }

  const { data: wave, error: waveErr } = await admin
    .from('event_waves')
    .select(WAVE_SELECT)
    .eq('id', waveId)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (waveErr) {
    logger.error('[admin/events/waves/[waveId]] lookup error', waveErr);
    return res.status(500).json({ error: 'Failed to load wave.' });
  }
  if (!wave) return res.status(404).json({ error: 'Wave not found.' });

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const parsed = UpdateWaveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload.',
        code: 'INVALID_PAYLOAD',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    const updatePayload: Record<string, unknown> = {};
    if (body.title !== undefined) updatePayload.title = body.title;
    if (body.planned_start_at !== undefined)
      updatePayload.planned_start_at = body.planned_start_at;
    if (body.duration_min !== undefined)
      updatePayload.duration_min = body.duration_min;
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.started_at !== undefined)
      updatePayload.started_at = body.started_at;
    if (body.ended_at !== undefined) updatePayload.ended_at = body.ended_at;

    // Auto-datation des transitions de statut (sauf override explicite).
    const now = new Date().toISOString();
    if (
      body.status === 'live' &&
      body.started_at === undefined &&
      wave.started_at === null
    ) {
      updatePayload.started_at = now;
    }
    if (
      body.status === 'done' &&
      body.ended_at === undefined &&
      wave.ended_at === null
    ) {
      updatePayload.ended_at = now;
    }

    const { data: updated, error: updErr } = await admin
      .from('event_waves')
      .update(updatePayload)
      .eq('id', waveId)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId)
      .select(WAVE_SELECT)
      .single();

    if (updErr || !updated) {
      logger.error('[admin/events/waves/[waveId]] update error', updErr);
      return res.status(500).json({ error: 'Failed to update wave.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'event_wave_manage',
        entity_type: 'event_wave',
        entity_id: waveId,
        tenant_id: ctx.tenantId,
        payload: { action: 'update_event_wave', changes: updatePayload },
      });
    }

    return res.status(200).json({ wave: updated });
  }

  if (req.method === 'DELETE') {
    const { error: delErr } = await admin
      .from('event_waves')
      .delete()
      .eq('id', waveId)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId);

    if (delErr) {
      logger.error('[admin/events/waves/[waveId]] delete error', delErr);
      return res.status(500).json({ error: 'Failed to delete wave.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'event_wave_manage',
        entity_type: 'event_wave',
        entity_id: waveId,
        tenant_id: ctx.tenantId,
        payload: { action: 'delete_event_wave', ord: wave.ord },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'PATCH,PUT,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
