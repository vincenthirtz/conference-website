import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../../utils/logger';
type CastMemberPayload = {
  name?: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  twitchUrl?: string | null;
  city?: string | null;
  isActive?: boolean;
  isPromo?: boolean;
  sortOrder?: number;
  authUserId?: string | null;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-cast-members'
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
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const includeInactive = req.query.includeInactive === 'true';

    let query = admin
      .from('cast_members')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('[admin/cast-members] list error', error);
      return res.status(500).json({ error: 'Failed to load cast members.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as CastMemberPayload;
    if (!body.name) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    // Récupérer le prochain sort_order
    const { data: maxOrder } = await admin
      .from('cast_members')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? 0) + 1;

    let authUserId: string | null = null;
    if ('authUserId' in body && body.authUserId) {
      if (typeof body.authUserId !== 'string' || !isValidUUID(body.authUserId)) {
        return res.status(400).json({ error: 'authUserId invalide.' });
      }
      authUserId = body.authUserId;
    }

    const insertPayload = {
      name: body.name.trim(),
      title: body.title?.trim() || null,
      description: body.description?.trim() || null,
      image_url: sanitizeUrl(body.imageUrl),
      twitch_url: sanitizeUrl(body.twitchUrl),
      city: body.city?.trim() || null,
      is_active: body.isActive ?? true,
      is_promo: body.isPromo ?? false,
      sort_order: body.sortOrder ?? nextOrder,
      auth_user_id: authUserId,
    };

    const { data, error } = await admin
      .from('cast_members')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error('[admin/cast-members] create error', error);
      const isCasterRoleError = /role=caster/i.test(error.message || '');
      const isUniqueError = error.code === '23505';
      if (isCasterRoleError) {
        return res.status(400).json({
          error:
            'Le compte selectionne doit avoir le role staff "caster".',
        });
      }
      if (isUniqueError) {
        return res.status(409).json({
          error: 'Ce compte caster est deja lie a une autre fiche.',
        });
      }
      return res
        .status(500)
        .json({ error: 'Failed to create the cast member.' });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
