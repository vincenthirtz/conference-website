import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
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
      'admin-cast-members-id'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid ID.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('cast_members')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (error) {
      logger.error('[admin/cast-members] get error', error);
      return res.status(404).json({ error: 'Cast member not found.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as CastMemberPayload;
    const updatePayload: Record<string, any> = {};

    if (typeof body.name === 'string') updatePayload.name = body.name.trim();
    if ('title' in body) updatePayload.title = body.title?.trim() || null;
    if ('description' in body)
      updatePayload.description = body.description?.trim() || null;
    if ('imageUrl' in body)
      updatePayload.image_url = sanitizeUrl(body.imageUrl);
    if ('twitchUrl' in body)
      updatePayload.twitch_url = sanitizeUrl(body.twitchUrl);
    if ('city' in body) updatePayload.city = body.city?.trim() || null;
    if ('isActive' in body) updatePayload.is_active = !!body.isActive;
    if ('isPromo' in body) updatePayload.is_promo = !!body.isPromo;
    if ('sortOrder' in body && Number.isFinite(body.sortOrder))
      updatePayload.sort_order = Number(body.sortOrder);
    if ('authUserId' in body) {
      if (body.authUserId === null || body.authUserId === '') {
        updatePayload.auth_user_id = null;
      } else if (
        typeof body.authUserId === 'string' &&
        isValidUUID(body.authUserId)
      ) {
        updatePayload.auth_user_id = body.authUserId;
      } else {
        return res.status(400).json({ error: 'authUserId invalide.' });
      }
    }

    const { data, error } = await admin
      .from('cast_members')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .select()
      .single();

    if (error) {
      logger.error('[admin/cast-members] update error', error);
      const isCasterRoleError = /role=caster/i.test(error.message || '');
      const isUniqueError = error.code === '23505';
      if (isCasterRoleError) {
        return res.status(400).json({
          error: 'Le compte selectionne doit avoir le role staff "caster".',
        });
      }
      if (isUniqueError) {
        return res.status(409).json({
          error: 'Ce compte caster est deja lie a une autre fiche.',
        });
      }
      return res
        .status(500)
        .json({ error: 'Failed to update the cast member.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await admin
      .from('cast_members')
      .delete()
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (error) {
      logger.error('[admin/cast-members] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the cast member.' });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
