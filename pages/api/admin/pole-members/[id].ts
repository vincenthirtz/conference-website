import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { isPoleKey } from '@/utils/associationPoles';

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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-pole-members-id'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid ID.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('association_pole_members')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('[admin/pole-members] get error', error);
      return res.status(404).json({ error: 'Pole member not found.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as PoleMemberPayload;
    const updatePayload: Record<string, any> = {};

    if ('poleKey' in body) {
      if (!isPoleKey(body.poleKey)) {
        return res.status(400).json({ error: 'Invalid poleKey.' });
      }
      updatePayload.pole_key = body.poleKey;
    }
    if (typeof body.name === 'string') {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Name cannot be empty.' });
      }
      updatePayload.name = trimmed;
    }
    if ('title' in body) updatePayload.title = body.title?.trim() || null;
    if ('description' in body)
      updatePayload.description = body.description?.trim() || null;
    if ('imageUrl' in body)
      updatePayload.image_url = sanitizeUrl(body.imageUrl);
    if ('linkUrl' in body) updatePayload.link_url = sanitizeUrl(body.linkUrl);
    if ('isActive' in body) updatePayload.is_active = !!body.isActive;
    if ('sortOrder' in body && Number.isFinite(body.sortOrder))
      updatePayload.sort_order = Number(body.sortOrder);

    const { data, error } = await admin
      .from('association_pole_members')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('[admin/pole-members] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the pole member.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await admin
      .from('association_pole_members')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('[admin/pole-members] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the pole member.' });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
