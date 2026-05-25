// pages/api/admin/events/[runId]/index.ts
//
// Feature: Run-of-show — Lot 2.
// GET    : event_run + ses segments tries par ord.
// PATCH  : update name/slug/description/scheduled_at (statut change uniquement
//          via /start ou /end).
// DELETE : suppression hard (CASCADE supprimera les segments).

import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const UpdateRunSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    scheduled_at: z.string().datetime().optional(),
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
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-events-id')
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
    .select(
      'id, tenant_id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at'
    )
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[admin/events/[runId]] lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) {
    return res.status(404).json({ error: 'Event run not found.' });
  }

  if (req.method === 'GET') {
    const { data: segments, error: segErr } = await admin
      .from('event_segments')
      .select(
        'id, ord, type, match_id, title, duration_min, planned_start_at, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
      )
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId)
      .order('ord', { ascending: true });

    if (segErr) {
      logger.error('[admin/events/[runId]] segments error', segErr);
      return res.status(500).json({ error: 'Failed to load segments.' });
    }

    return res.status(200).json({
      run,
      segments: segments ?? [],
    });
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const parsed = UpdateRunSchema.safeParse(req.body ?? {});
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
    if (body.description !== undefined)
      updatePayload.description = body.description;
    if (body.scheduled_at !== undefined)
      updatePayload.scheduled_at = body.scheduled_at;

    if (body.slug !== undefined) {
      const slug = slugify(body.slug, { lower: true, strict: true });
      if (!slug) {
        return res
          .status(400)
          .json({ error: 'Slug invalide.', code: 'INVALID_SLUG' });
      }
      if (slug !== run.slug) {
        const { data: collision } = await admin
          .from('event_runs')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('slug', slug)
          .neq('id', runId)
          .maybeSingle();
        if (collision) {
          return res.status(409).json({
            error: `Un event_run avec le slug "${slug}" existe deja dans ce tenant.`,
            code: 'DUPLICATE_SLUG',
          });
        }
      }
      updatePayload.slug = slug;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res
        .status(400)
        .json({ error: 'Aucun champ a mettre a jour.', code: 'EMPTY_UPDATE' });
    }

    const { data: updated, error: updErr } = await admin
      .from('event_runs')
      .update(updatePayload)
      .eq('id', runId)
      .eq('tenant_id', ctx.tenantId)
      .select(
        'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at'
      )
      .single();

    if (updErr || !updated) {
      logger.error('[admin/events/[runId]] update error', updErr);
      return res.status(500).json({ error: 'Failed to update event run.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'event_run',
        entity_id: runId,
        tenant_id: ctx.tenantId,
        payload: { action: 'update_event_run', changes: updatePayload },
      });
    }

    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    const { error: delErr } = await admin
      .from('event_runs')
      .delete()
      .eq('id', runId)
      .eq('tenant_id', ctx.tenantId);

    if (delErr) {
      logger.error('[admin/events/[runId]] delete error', delErr);
      return res.status(500).json({ error: 'Failed to delete event run.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'event_run',
        entity_id: runId,
        tenant_id: ctx.tenantId,
        payload: { action: 'delete_event_run', slug: run.slug, name: run.name },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET,PATCH,PUT,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'manager');
