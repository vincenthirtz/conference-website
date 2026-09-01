// pages/api/admin/events/[runId]/stations/index.ts
//
// Feature: Waves + Stations (event director).
// GET  : liste des stations d'un event_run, triees par ord asc puis name.
// POST : create station. Si `ord` absent, MAX(ord)+1 (0 si aucune).
//        status='idle'. tenant_id denormalise depuis le run.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const STATION_SELECT =
  'id, tenant_id, event_run_id, ord, name, stream_url, notes, status, created_at, updated_at';

const CreateStationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  stream_url: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
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
      'admin-events-stations'
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
    logger.error('[admin/events/stations] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) return res.status(404).json({ error: 'Event run not found.' });

  if (req.method === 'GET') {
    const { data: stations, error: stErr } = await admin
      .from('event_stations')
      .select(STATION_SELECT)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId)
      .order('ord', { ascending: true })
      .order('name', { ascending: true });

    if (stErr) {
      logger.error('[admin/events/stations] list error', stErr);
      return res.status(500).json({ error: 'Failed to load stations.' });
    }

    return res.status(200).json({ stations: stations ?? [] });
  }

  if (req.method === 'POST') {
    const parsed = CreateStationSchema.safeParse(req.body ?? {});
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
      const { data: lastStation } = await admin
        .from('event_stations')
        .select('ord')
        .eq('event_run_id', runId)
        .eq('tenant_id', ctx.tenantId)
        .order('ord', { ascending: false })
        .limit(1)
        .maybeSingle();
      ord = lastStation ? (lastStation.ord as number) + 1 : 0;
    }

    const insertPayload = {
      event_run_id: runId,
      tenant_id: ctx.tenantId,
      ord,
      name: body.name,
      stream_url: body.stream_url ?? null,
      notes: body.notes ?? null,
      status: 'idle' as const,
    };

    const { data: inserted, error: insertErr } = await admin
      .from('event_stations')
      .insert(insertPayload)
      .select(STATION_SELECT)
      .single();

    if (insertErr || !inserted) {
      logger.error('[admin/events/stations] insert error', insertErr);
      return res.status(500).json({ error: 'Failed to create station.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'event_station_manage',
        entity_type: 'event_station',
        entity_id: inserted.id,
        tenant_id: ctx.tenantId,
        payload: { action: 'create_event_station', runId, ord },
      });
    }

    return res.status(201).json({ station: inserted });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
