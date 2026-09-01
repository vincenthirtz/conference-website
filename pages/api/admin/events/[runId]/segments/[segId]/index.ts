// pages/api/admin/events/[runId]/segments/[segId]/index.ts
//
// Feature: Run-of-show — Lot 2.
// GET    : segment details.
// PATCH  : update title, duration_min, broadcast_message, caster_checklist
//          (template). Le status, started_at, ended_at ne sont PAS modifiables
//          ici — ils sont controles par /start /skip /end. Le ord non plus :
//          utiliser /reorder.
// DELETE : suppression hard.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const ChecklistItemSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  checked_by_user_id: z.string().uuid().nullable().optional(),
  checked_at: z.string().datetime().nullable().optional(),
});

const BroadcastMessageSchema = z
  .object({
    discord: z.string().max(2000).optional(),
    push_title: z.string().max(200).optional(),
    push_body: z.string().max(500).optional(),
    email_subject: z.string().max(200).optional(),
  })
  .strict()
  .nullable();

const UpdateSegmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    duration_min: z.number().int().positive().nullable().optional(),
    // Lot 6 timing : override ancrage horaire absolu. null = unlock (revient au mode computed).
    planned_start_at: z.string().datetime().nullable().optional(),
    // Feature Waves + Stations : assignation d'un segment a une wave / station.
    // null = detache. La wave/station citee doit appartenir au meme run+tenant.
    wave_id: z.string().uuid().nullable().optional(),
    station_id: z.string().uuid().nullable().optional(),
    broadcast_message: BroadcastMessageSchema.optional(),
    caster_checklist: z.array(ChecklistItemSchema).optional(),
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
      'admin-events-seg-id'
    )
  )
    return;

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

  const { data: segment, error: segErr } = await admin
    .from('event_segments')
    .select(
      'id, event_run_id, tenant_id, ord, type, match_id, wave_id, station_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
    )
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (segErr) {
    logger.error('[admin/events/seg/[segId]] lookup error', segErr);
    return res.status(500).json({ error: 'Failed to load segment.' });
  }
  if (!segment) {
    return res.status(404).json({ error: 'Segment not found.' });
  }

  if (req.method === 'GET') {
    return res.status(200).json(segment);
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const parsed = UpdateSegmentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload.',
        code: 'INVALID_PAYLOAD',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    // Validation d'appartenance : une wave/station assignee doit exister dans
    // le meme run + tenant (defense contre le cross-run/cross-tenant).
    if (body.wave_id !== undefined && body.wave_id !== null) {
      const { data: wave } = await admin
        .from('event_waves')
        .select('id')
        .eq('id', body.wave_id)
        .eq('event_run_id', runId)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();
      if (!wave) {
        return res.status(400).json({
          error:
            "La wave_id referencee n'existe pas ou n'appartient pas a ce run.",
          code: 'INVALID_WAVE_ID',
        });
      }
    }
    if (body.station_id !== undefined && body.station_id !== null) {
      const { data: st } = await admin
        .from('event_stations')
        .select('id')
        .eq('id', body.station_id)
        .eq('event_run_id', runId)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();
      if (!st) {
        return res.status(400).json({
          error:
            "La station_id referencee n'existe pas ou n'appartient pas a ce run.",
          code: 'INVALID_STATION_ID',
        });
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (body.title !== undefined) updatePayload.title = body.title;
    if (body.duration_min !== undefined)
      updatePayload.duration_min = body.duration_min;
    if (body.planned_start_at !== undefined)
      updatePayload.planned_start_at = body.planned_start_at;
    if (body.wave_id !== undefined) updatePayload.wave_id = body.wave_id;
    if (body.station_id !== undefined)
      updatePayload.station_id = body.station_id;
    if (body.broadcast_message !== undefined)
      updatePayload.broadcast_message = body.broadcast_message;
    if (body.caster_checklist !== undefined)
      updatePayload.caster_checklist = body.caster_checklist;

    if (Object.keys(updatePayload).length === 0) {
      return res
        .status(400)
        .json({ error: 'Aucun champ a mettre a jour.', code: 'EMPTY_UPDATE' });
    }

    const { data: updated, error: updErr } = await admin
      .from('event_segments')
      .update(updatePayload)
      .eq('id', segId)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId)
      .select(
        'id, ord, type, match_id, wave_id, station_id, title, duration_min, planned_start_at, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
      )
      .single();

    if (updErr || !updated) {
      logger.error('[admin/events/seg/[segId]] update error', updErr);
      return res.status(500).json({ error: 'Failed to update segment.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'event_segment_manage',
        entity_type: 'event_segment',
        entity_id: segId,
        tenant_id: ctx.tenantId,
        payload: { action: 'update_event_segment', changes: updatePayload },
      });
    }

    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    const { error: delErr } = await admin
      .from('event_segments')
      .delete()
      .eq('id', segId)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId);

    if (delErr) {
      logger.error('[admin/events/seg/[segId]] delete error', delErr);
      return res.status(500).json({ error: 'Failed to delete segment.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'event_segment_manage',
        entity_type: 'event_segment',
        entity_id: segId,
        tenant_id: ctx.tenantId,
        payload: { action: 'delete_event_segment', ord: segment.ord },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET,PATCH,PUT,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
