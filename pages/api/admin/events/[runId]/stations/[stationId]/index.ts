// pages/api/admin/events/[runId]/stations/[stationId]/index.ts
//
// Feature: Waves + Stations (event director).
// PATCH  : update partiel d'une station (name, stream_url, notes, status, ord).
// DELETE : suppression hard. La FK event_segments.station_id est ON DELETE SET
//          NULL (les segments rattaches voient station_id remis a NULL).

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

const StationStatusSchema = z.enum(['idle', 'in_use', 'offline']);

const UpdateStationSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    stream_url: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    status: StationStatusSchema.optional(),
    ord: z.number().int().nonnegative().optional(),
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
      'admin-events-station-id'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { runId, stationId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }
  if (!stationId || Array.isArray(stationId) || !isValidUUID(stationId)) {
    return res.status(400).json({ error: 'Invalid stationId.' });
  }

  const { data: station, error: stErr } = await admin
    .from('event_stations')
    .select(STATION_SELECT)
    .eq('id', stationId)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (stErr) {
    logger.error('[admin/events/stations/[stationId]] lookup error', stErr);
    return res.status(500).json({ error: 'Failed to load station.' });
  }
  if (!station) return res.status(404).json({ error: 'Station not found.' });

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const parsed = UpdateStationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload.',
        code: 'INVALID_PAYLOAD',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    const updatePayload: Record<string, unknown> = {};
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.stream_url !== undefined)
      updatePayload.stream_url = body.stream_url;
    if (body.notes !== undefined) updatePayload.notes = body.notes;
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.ord !== undefined) updatePayload.ord = body.ord;

    const { data: updated, error: updErr } = await admin
      .from('event_stations')
      .update(updatePayload)
      .eq('id', stationId)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId)
      .select(STATION_SELECT)
      .single();

    if (updErr || !updated) {
      logger.error('[admin/events/stations/[stationId]] update error', updErr);
      return res.status(500).json({ error: 'Failed to update station.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'event_station',
        entity_id: stationId,
        tenant_id: ctx.tenantId,
        payload: { action: 'update_event_station', changes: updatePayload },
      });
    }

    return res.status(200).json({ station: updated });
  }

  if (req.method === 'DELETE') {
    const { error: delErr } = await admin
      .from('event_stations')
      .delete()
      .eq('id', stationId)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId);

    if (delErr) {
      logger.error('[admin/events/stations/[stationId]] delete error', delErr);
      return res.status(500).json({ error: 'Failed to delete station.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'event_station',
        entity_id: stationId,
        tenant_id: ctx.tenantId,
        payload: { action: 'delete_event_station', name: station.name },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'PATCH,PUT,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
