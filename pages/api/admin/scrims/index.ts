// pages/api/admin/scrims/index.ts
// Admin: gestion des scrims (sessions de matchs amicaux entre 2 equipes)
// - GET  : liste filtrable/paginee
// - POST : creation d'un scrim (minimal)

import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import {
  parsePagination,
  sanitizeSearch,
  isValidUUID,
} from '@/utils/apiHelpers';
import { emitScrimEvent } from '@/utils/scrimEvents';
import { logger } from '../../../../utils/logger';

const VALID_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;
type ScrimStatus = (typeof VALID_STATUSES)[number];

export type ScrimCreateInput = {
  name: string;
  slug?: string | null;
  game?: string | null;
  status?: ScrimStatus | null;
  team1_id?: string | null;
  team2_id?: string | null;
  scheduled_date?: string | null;
  timezone?: string | null;
  is_public?: boolean | null;
  description?: string | null;
  stream_url?: string | null;
};

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-scrims' }),
  'admin'
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
    logger.error('[/api/admin/scrims] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* GET : liste */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  const {
    status,
    teamId,
    dateFrom,
    dateTo,
    orderBy,
    orderDir,
    includeTotal,
  } = req.query;

  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 50,
  });
  const search = sanitizeSearch(req.query.search);

  const orderByField =
    orderBy === 'scheduled_date' ? 'scheduled_date' : 'created_at';
  const orderDirection =
    orderDir === 'asc' ? { ascending: true } : { ascending: false };

  let query = supabaseAdmin
    .from('scrims')
    .select(
      `
        id, name, slug, game, status,
        team1_id, team2_id,
        scheduled_date, timezone,
        is_public, logo_url, banner_url, description, stream_url,
        source_demande_id, settings, created_at, updated_at,
        team1:teams!scrims_team1_id_fkey(id, name, short_name, logo_url),
        team2:teams!scrims_team2_id_fkey(id, name, short_name, logo_url)
      `,
      {
        count:
          includeTotal === '1' || includeTotal === 'true' ? 'exact' : undefined,
      }
    )
    .eq('tenant_id', ctx.tenantId);

  // Filtre soft-delete : par défaut on cache les scrims supprimés. Pour
  // l'admin "recycle bin", passer includeDeleted=1.
  const includeDeleted =
    req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

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
    const s = `%${search}%`;
    query = query.or(`name.ilike.${s},slug.ilike.${s}`);
  }

  if (dateFrom && !Array.isArray(dateFrom)) {
    query = query.gte('scheduled_date', dateFrom);
  }
  if (dateTo && !Array.isArray(dateTo)) {
    query = query.lte('scheduled_date', dateTo);
  }

  query = query
    .order(orderByField, orderDirection)
    .range(offsetNum, offsetNum + limitNum - 1);

  const { data, error, count } = await query;
  if (error) {
    logger.error('[admin/scrims] GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch scrims' });
  }

  return res.status(200).json({
    scrims: data ?? [],
    total: typeof count === 'number' ? count : null,
  });
}

/* POST : creation */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  const body = (req.body ?? {}) as ScrimCreateInput;

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return res.status(400).json({ error: "Field 'name' is required" });
  }

  const name = body.name.trim();
  const slug =
    typeof body.slug === 'string' && body.slug.trim().length > 0
      ? body.slug.trim()
      : slugify(`${name}-${Date.now().toString(36)}`, {
          lower: true,
          strict: true,
        });

  const status = (body.status ?? 'draft') as ScrimStatus;
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({
      error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
    });
  }

  if (body.team1_id && !isValidUUID(body.team1_id)) {
    return res.status(400).json({ error: 'team1_id invalide' });
  }
  if (body.team2_id && !isValidUUID(body.team2_id)) {
    return res.status(400).json({ error: 'team2_id invalide' });
  }
  if (body.team1_id && body.team2_id && body.team1_id === body.team2_id) {
    return res
      .status(400)
      .json({ error: 'team1_id et team2_id doivent etre distincts' });
  }

  if (body.scheduled_date && Number.isNaN(Date.parse(body.scheduled_date))) {
    return res.status(400).json({ error: 'scheduled_date invalide' });
  }

  const { data: existingSlug } = await supabaseAdmin
    .from('scrims')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('slug', slug)
    .maybeSingle();
  if (existingSlug) {
    return res.status(409).json({
      error: `Un scrim avec le slug "${slug}" existe deja.`,
    });
  }

  const payload = {
    tenant_id: ctx.tenantId,
    name,
    slug,
    game: body.game ?? null,
    status,
    team1_id: body.team1_id ?? null,
    team2_id: body.team2_id ?? null,
    scheduled_date: body.scheduled_date ?? null,
    timezone: body.timezone ?? 'Europe/Paris',
    is_public: body.is_public ?? false,
    description: body.description ?? null,
    stream_url: body.stream_url ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('scrims')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('[admin/scrims] POST error:', error);
    return res.status(500).json({ error: 'Failed to create scrim' });
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'scrim',
        entity_id: data.id,
        tournament_id: null,
        payload: {
          subject: 'create_scrim',
          name: data.name,
          slug: data.slug,
        },
      });
    } catch (e) {
      logger.error('[admin/scrims] log error:', e);
    }
  }

  void emitScrimEvent('scrim.created', data, ctx.tenantId);
  // Si on naît directement en 'scheduled', le bot doit aussi pouvoir s'accrocher
  // à l'event de programmation (annonce dans #scrims, etc.).
  if (data.status === 'scheduled') {
    void emitScrimEvent('scrim.scheduled', data, ctx.tenantId, {
      previousStatus: 'draft',
    });
  }

  return res.status(201).json({ scrim: data });
}
