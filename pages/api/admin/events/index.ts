// pages/api/admin/events/index.ts
//
// Feature: Run-of-show — Lot 2 (Caster Cockpit + Live Director).
// GET  : liste paginee des event_runs du tenant (filtres status/scheduled_at).
// POST : creation d'un event_run (draft, sans segments).
//
// Auth : staff role >= manager (le manager peut planifier une soiree, l'admin
// confirme via /start). Le check tenant est gere par withStaffRoute.

import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { parsePagination } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const CreateRunSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  scheduled_at: z
    .string()
    .datetime({ message: 'scheduled_at doit etre un ISO 8601 datetime.' }),
});

function normalizeSlug(name: string, slug?: string): string {
  const base = slug?.trim().length ? slug : name;
  return slugify(base, { lower: true, strict: true });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-events'))
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  if (req.method === 'GET') {
    const { limit, offset } = parsePagination(req, {
      limit: 50,
      maxLimit: 200,
    });
    const statusFilter = req.query.status;

    let query = admin
      .from('event_runs')
      .select(
        'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at',
        { count: 'exact' }
      )
      .eq('tenant_id', ctx.tenantId)
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (typeof statusFilter === 'string' && statusFilter.length > 0) {
      if (!['draft', 'live', 'done'].includes(statusFilter)) {
        return res.status(400).json({
          error: "status doit etre 'draft', 'live' ou 'done'.",
          code: 'INVALID_STATUS',
        });
      }
      query = query.eq('status', statusFilter);
    }

    const { data, error, count } = await query;
    if (error) {
      logger.error('[admin/events] list error', error);
      return res.status(500).json({ error: 'Failed to load event runs.' });
    }

    return res
      .status(200)
      .json({ items: data ?? [], total: count ?? data?.length ?? 0 });
  }

  if (req.method === 'POST') {
    const parsed = CreateRunSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload.',
        code: 'INVALID_PAYLOAD',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    const slug = normalizeSlug(body.name, body.slug);
    if (!slug) {
      return res
        .status(400)
        .json({ error: 'Slug invalide.', code: 'INVALID_SLUG' });
    }

    const { data: existing } = await admin
      .from('event_runs')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('slug', slug)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({
        error: `Un event_run avec le slug "${slug}" existe deja dans ce tenant.`,
        code: 'DUPLICATE_SLUG',
      });
    }

    const insertPayload = {
      tenant_id: ctx.tenantId,
      name: body.name,
      slug,
      description: body.description ?? null,
      scheduled_at: body.scheduled_at,
      status: 'draft' as const,
    };

    const { data, error } = await admin
      .from('event_runs')
      .insert(insertPayload)
      .select(
        'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at'
      )
      .single();

    if (error || !data) {
      logger.error('[admin/events] create error', error);
      return res.status(500).json({ error: 'Failed to create the event run.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'event_run',
        entity_id: data.id,
        tenant_id: ctx.tenantId,
        payload: { action: 'create_event_run', slug, name: data.name },
      });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'manager');
