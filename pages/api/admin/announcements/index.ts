import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  sanitizeUrl,
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { notifyAnnouncement } from '@/utils/discord';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../utils/logger';

// Colonnes effectivement rendues par la page admin (pas de select('*')).
const ANNOUNCEMENT_COLUMNS =
  'id, title, message, cta_label, cta_url, is_active, priority, starts_at, ends_at, created_at, updated_at';

// Allowlist de tri (orderBy) — empêche toute injection de colonne.
const ORDER_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'priority',
  'title',
  'starts_at',
  'ends_at',
]);

type AnnouncementPayload = {
  title?: string;
  message?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  priority?: number;
};

function toISO(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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
      'admin-announcements'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  if (req.method === 'GET') {
    const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
      limit: 50,
    });
    const search = sanitizeSearch(req.query.search);

    const includeInactive = req.query.includeInactive === 'true';
    const wantTotal =
      req.query.includeTotal === '1' || req.query.includeTotal === 'true';

    // Filtre statut explicite (prioritaire sur includeInactive si fourni).
    // status=active | inactive ; sinon includeInactive contrôle l'inclusion.
    const status =
      typeof req.query.status === 'string' ? req.query.status : null;

    // Tri serveur via allowlist ; défaut created_at desc.
    const rawOrderBy =
      typeof req.query.orderBy === 'string' ? req.query.orderBy : 'created_at';
    const orderBy = ORDER_COLUMNS.has(rawOrderBy) ? rawOrderBy : 'created_at';
    const ascending = req.query.orderDir === 'asc';

    let query = admin
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS, {
        count: wantTotal ? 'exact' : undefined,
      })
      .eq('tenant_id', ctx.tenantId);

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    } else if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    if (search) {
      const s = `%${escapePostgrestValue(search)}%`;
      query = query.or(`title.ilike.${s},message.ilike.${s}`);
    }

    query = query
      .order(orderBy, { ascending, nullsFirst: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[admin/announcements] list error', error);
      return res.status(500).json({ error: 'Failed to load announcements.' });
    }

    return res.status(200).json({
      items: data ?? [],
      total: typeof count === 'number' ? count : null,
    });
  }

  if (req.method === 'POST') {
    const body = req.body as AnnouncementPayload;
    if (!body.title || !body.message) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }

    const insertPayload = {
      tenant_id: ctx.tenantId,
      title: body.title.trim(),
      message: body.message.trim(),
      cta_label: body.ctaLabel?.trim() || null,
      cta_url: sanitizeUrl(body.ctaUrl),
      is_active: body.isActive ?? true,
      priority: Number.isFinite(body.priority) ? Number(body.priority) : 0,
      starts_at: toISO(body.startsAt),
      ends_at: toISO(body.endsAt),
    };

    const { data, error } = await admin
      .from('announcements')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error('[admin/announcements] create error', error);
      return res
        .status(500)
        .json({ error: 'Failed to create the announcement.' });
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'create_announcement',
          entity_type: 'announcement',
          entity_id: data.id,
          tenant_id: ctx.tenantId,
          payload: { title: data.title, isActive: data.is_active },
        });
      } catch (logErr) {
        logger.error('logStaffAction(create_announcement) error:', logErr);
      }
    }

    if (data?.is_active) {
      void notifyAnnouncement({
        tournamentId: null,
        title: data.title,
        message: data.message,
        ctaLabel: data.cta_label ?? null,
        ctaUrl: data.cta_url ?? null,
      }).catch((e) => logger.error('[discord] notifyAnnouncement error:', e));
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_communications' });
