// pages/api/admin/scrim-plannings/index.ts
// Admin: sessions de planning de scrim (grille de dispos partagée « When2Meet »
// entre 2 équipes).
// - GET  : liste filtrable / paginée (tenant-scoped, exclut les soft-deleted)
// - POST : ouverture d'une session
//
// Distinct de /api/admin/scrims : une planning N'EST PAS un scrim. La validation
// d'un créneau (route [planningId]/validate) matérialise ensuite un scrim.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import {
  parsePagination,
  sanitizeSearch,
  isValidUUID,
} from '@/utils/apiHelpers';
import { emitScrimPlanningEvent } from '@/utils/scrimPlanningEvents';
import { todayInTimezone } from '@/utils/teams/scrimPlanningConfig';
import { logger } from '@/utils/logger';

const VALID_STATUSES = ['open', 'validated', 'cancelled', 'closed'] as const;

const createSchema = z
  .object({
    team1_id: z.string().uuid('team1_id invalide'),
    team2_id: z.string().uuid('team2_id invalide'),
    title: z.string().trim().max(200).optional().nullable(),
    game: z.string().trim().max(80).optional().nullable(),
    horizon_start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'horizon_start doit être YYYY-MM-DD')
      .optional(),
    horizon_days: z.number().int().min(1).max(42).optional(),
    slot_minutes: z.union([z.literal(30), z.literal(60)]).optional(),
    day_start_min: z.number().int().min(0).max(1440).optional(),
    day_end_min: z.number().int().min(0).max(1440).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    source_demande_id: z.string().uuid().optional().nullable(),
  })
  .refine((v) => v.team1_id !== v.team2_id, {
    message: 'team1_id et team2_id doivent être distincts',
    path: ['team2_id'],
  })
  .refine(
    (v) =>
      v.day_start_min === undefined ||
      v.day_end_min === undefined ||
      v.day_end_min > v.day_start_min,
    {
      message: 'day_end_min doit être supérieur à day_start_min',
      path: ['day_end_min'],
    }
  );

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-scrim-plannings' }),
  'manager'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, ctx);
      case 'POST':
        return await handlePost(req, res, ctx);
      default:
        res.setHeader('Allow', 'GET,POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    logger.error('[/api/admin/scrim-plannings] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  const { status, teamId } = req.query;
  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 50,
  });
  const search = sanitizeSearch(req.query.search);

  let query = supabaseAdmin
    .from('scrim_plannings')
    .select('*', { count: 'exact' })
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null);

  if (status && !Array.isArray(status)) {
    if (!(VALID_STATUSES as readonly string[]).includes(status as string)) {
      return res.status(400).json({
        error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
      });
    }
    query = query.eq('status', status);
  }

  if (teamId && !Array.isArray(teamId) && isValidUUID(teamId)) {
    query = query.or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`);
  }

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offsetNum, offsetNum + limitNum - 1);

  const { data, error, count } = await query;
  if (error) {
    logger.error('[admin/scrim-plannings] GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch scrim plannings' });
  }

  return res.status(200).json({
    plannings: data ?? [],
    total: typeof count === 'number' ? count : null,
  });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({
      error: first?.message || 'Requête invalide.',
      field: first?.path?.join('.') || undefined,
    });
  }
  const body = parsed.data;

  const timezone = body.timezone ?? 'Europe/Paris';
  const horizonStart = body.horizon_start ?? todayInTimezone(timezone);

  const payload = {
    tenant_id: ctx.tenantId,
    created_by: ctx.staff?.id ?? null,
    team1_id: body.team1_id,
    team2_id: body.team2_id,
    title: body.title ?? null,
    game: body.game ?? null,
    status: 'open',
    horizon_start: horizonStart,
    horizon_days: body.horizon_days ?? 21,
    slot_minutes: body.slot_minutes ?? 30,
    day_start_min: body.day_start_min ?? 960,
    day_end_min: body.day_end_min ?? 1440,
    timezone,
    is_public: false,
    source_demande_id: body.source_demande_id ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('scrim_plannings')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('[admin/scrim-plannings] POST error:', error);
    return res.status(500).json({ error: 'Failed to create scrim planning' });
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'scrim_planning',
        entity_id: data.id,
        tournament_id: null,
        tenant_id: ctx.tenantId,
        payload: {
          subject: 'create_scrim_planning',
          title: data.title,
          team1_id: data.team1_id,
          team2_id: data.team2_id,
        },
      });
    } catch (e) {
      logger.error('[admin/scrim-plannings] log error:', e);
    }
  }

  void emitScrimPlanningEvent('scrim.planning.opened', data, ctx.tenantId);

  return res.status(201).json({ planning: data });
}
