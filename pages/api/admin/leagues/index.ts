// pages/api/admin/leagues/index.ts
// GET  → liste des leagues du tenant.
// POST → création d'une league (slug unique/tenant).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const pointsTableSchema = z.record(z.string(), z.number());

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  description: z.string().trim().max(2000).optional().nullable(),
  game: z.string().trim().max(100).optional().nullable(),
  start_date: z.string().trim().optional().nullable(),
  end_date: z.string().trim().optional().nullable(),
  points_table: pointsTableSchema.optional(),
  is_public: z.boolean().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-leagues'))
    return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('[admin/leagues] list error', error);
      return res.status(500).json({ error: 'Failed to load leagues' });
    }
    return res.status(200).json({ leagues: data ?? [] });
  }

  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid body',
        code: 'INVALID_BODY',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    // Slug unique / tenant.
    const { data: existing } = await supabaseAdmin
      .from('leagues')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('slug', body.slug)
      .maybeSingle();
    if (existing) {
      return res
        .status(409)
        .json({ error: 'Slug already in use', code: 'SLUG_CONFLICT' });
    }

    const insertPayload: Record<string, unknown> = {
      tenant_id: ctx.tenantId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      game: body.game ?? null,
      status: 'draft',
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      is_public: body.is_public ?? false,
    };
    // points_table : si fourni on l'écrit, sinon on laisse le default DB.
    if (body.points_table !== undefined) {
      insertPayload.points_table = body.points_table;
    }

    const { data, error } = await supabaseAdmin
      .from('leagues')
      .insert(insertPayload)
      .select('*')
      .single();
    if (error) {
      logger.error('[admin/leagues] create error', error);
      return res.status(500).json({ error: 'Failed to create league' });
    }

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'league',
      entity_id: data.id,
      tenant_id: ctx.tenantId,
      payload: { operation: 'create_league', slug: data.slug },
    });

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'manager');
