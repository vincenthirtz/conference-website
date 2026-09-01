// pages/api/admin/leagues/[id]/index.ts
// GET    → détail d'une league.
// PATCH  → mise à jour partielle.
// DELETE → suppression.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const pointsTableSchema = z.record(z.string(), z.number());

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/),
    description: z.string().trim().max(2000).nullable(),
    game: z.string().trim().max(100).nullable(),
    status: z.enum(['draft', 'active', 'finished', 'archived']),
    start_date: z.string().trim().nullable(),
    end_date: z.string().trim().nullable(),
    points_table: pointsTableSchema,
    is_public: z.boolean(),
  })
  .partial();

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-leagues-id')
  )
    return;

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid id' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.error('[admin/leagues/id] fetch error', error);
      return res.status(500).json({ error: 'Failed to load league' });
    }
    if (!data) return res.status(404).json({ error: 'League not found' });
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid body',
        code: 'INVALID_BODY',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Slug unique / tenant si modifié.
    if (body.slug !== undefined) {
      const { data: clash } = await supabaseAdmin
        .from('leagues')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('slug', body.slug)
        .neq('id', id)
        .maybeSingle();
      if (clash) {
        return res
          .status(409)
          .json({ error: 'Slug already in use', code: 'SLUG_CONFLICT' });
      }
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    for (const key of Object.keys(body) as (keyof typeof body)[]) {
      updatePayload[key] = body[key];
    }

    const { data, error } = await supabaseAdmin
      .from('leagues')
      .update(updatePayload)
      .eq('tenant_id', ctx.tenantId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      logger.error('[admin/leagues/id] update error', error);
      return res.status(500).json({ error: 'Failed to update league' });
    }
    if (!data) return res.status(404).json({ error: 'League not found' });

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'league',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { operation: 'update_league', fields: Object.keys(body) },
    });

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('leagues')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('id', id);
    if (error) {
      logger.error('[admin/leagues/id] delete error', error);
      return res.status(500).json({ error: 'Failed to delete league' });
    }

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'league',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { operation: 'delete_league' },
    });

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_tournaments' });
