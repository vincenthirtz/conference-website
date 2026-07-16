// pages/api/admin/events/[runId]/waves/index.ts
//
// Feature: Waves + Stations (event director).
// GET  : liste des waves d'un event_run, triees par ord asc.
// POST : create wave. Si `ord` absent, l'API calcule MAX(ord)+1 (queue, 0 si
//        aucune). tenant_id denormalise depuis le run (meme pattern que
//        event_segments). status='upcoming'.

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

const CreateWaveSchema = z.object({
  title: z.string().trim().min(1).max(200),
  planned_start_at: z.string().datetime().nullable().optional(),
  duration_min: z.number().int().positive().nullable().optional(),
  ord: z.number().int().nonnegative().optional(),
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
      'admin-events-waves'
    )
  )
    return;

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
    .select('id, tenant_id')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[admin/events/waves] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) return res.status(404).json({ error: 'Event run not found.' });

  if (req.method === 'GET') {
    const { data: waves, error: wavesErr } = await admin
      .from('event_waves')
      .select(WAVE_SELECT)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId)
      .order('ord', { ascending: true });

    if (wavesErr) {
      logger.error('[admin/events/waves] list error', wavesErr);
      return res.status(500).json({ error: 'Failed to load waves.' });
    }

    return res.status(200).json({ waves: waves ?? [] });
  }

  if (req.method === 'POST') {
    const parsed = CreateWaveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload.',
        code: 'INVALID_PAYLOAD',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    let ord = body.ord;
    if (ord === undefined) {
      const { data: lastWave } = await admin
        .from('event_waves')
        .select('ord')
        .eq('event_run_id', runId)
        .eq('tenant_id', ctx.tenantId)
        .order('ord', { ascending: false })
        .limit(1)
        .maybeSingle();
      ord = lastWave ? (lastWave.ord as number) + 1 : 0;
    }

    const insertPayload = {
      event_run_id: runId,
      tenant_id: ctx.tenantId,
      ord,
      title: body.title,
      planned_start_at: body.planned_start_at ?? null,
      duration_min: body.duration_min ?? null,
      status: 'upcoming' as const,
    };

    const { data: inserted, error: insertErr } = await admin
      .from('event_waves')
      .insert(insertPayload)
      .select(WAVE_SELECT)
      .single();

    if (insertErr || !inserted) {
      logger.error('[admin/events/waves] insert error', insertErr);
      return res.status(500).json({ error: 'Failed to create wave.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'event_wave',
        entity_id: inserted.id,
        tenant_id: ctx.tenantId,
        payload: { action: 'create_event_wave', runId, ord },
      });
    }

    return res.status(201).json({ wave: inserted });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
