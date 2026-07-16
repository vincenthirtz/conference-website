import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { isPoleKey } from '@/utils/associationPoles';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../utils/logger';

type PoleMemberPayload = {
  poleKey?: string;
  name?: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

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
      'admin-pole-members'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
    const includeInactive = req.query.includeInactive === 'true';
    const poleKey = req.query.poleKey;

    let query = admin
      .from('association_pole_members')
      .select('*')
      .order('pole_key', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    if (typeof poleKey === 'string' && isPoleKey(poleKey)) {
      query = query.eq('pole_key', poleKey);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('[admin/pole-members] list error', error);
      return res.status(500).json({ error: 'Failed to load pole members.' });
    }
    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as PoleMemberPayload;
    if (!body.name || !body.name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (!isPoleKey(body.poleKey)) {
      return res.status(400).json({ error: 'Invalid or missing poleKey.' });
    }

    const { data: maxOrder } = await admin
      .from('association_pole_members')
      .select('sort_order')
      .eq('pole_key', body.poleKey)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxOrder?.sort_order ?? 0) + 1;

    const insertPayload = {
      pole_key: body.poleKey,
      name: body.name.trim(),
      title: body.title?.trim() || null,
      description: body.description?.trim() || null,
      image_url: sanitizeUrl(body.imageUrl),
      link_url: sanitizeUrl(body.linkUrl),
      is_active: body.isActive ?? true,
      sort_order: Number.isFinite(body.sortOrder)
        ? Number(body.sortOrder)
        : nextOrder,
    };

    const { data, error } = await admin
      .from('association_pole_members')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error('[admin/pole-members] create error', error);
      return res
        .status(500)
        .json({ error: 'Failed to create the pole member.' });
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'create_pole_member',
          entity_type: 'pole_member',
          entity_id: data.id,
          tenant_id: ctx.tenantId,
          payload: { name: data.name, poleKey: data.pole_key },
        });
      } catch (logErr) {
        logger.error('logStaffAction(create_pole_member) error:', logErr);
      }
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
