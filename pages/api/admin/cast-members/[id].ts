import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

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
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing ID.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('cast_members')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admin/cast-members] get error', error);
      return res
        .status(404)
        .json({ error: 'Cast member not found.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as CastMemberPayload;
    const updatePayload: Record<string, any> = {};

    if (typeof body.name === 'string')
      updatePayload.name = body.name.trim();
    if ('title' in body)
      updatePayload.title = body.title?.trim() || null;
    if ('description' in body)
      updatePayload.description = body.description?.trim() || null;
    if ('imageUrl' in body)
      updatePayload.image_url = body.imageUrl?.trim() || null;
    if ('twitchUrl' in body)
      updatePayload.twitch_url = body.twitchUrl?.trim() || null;
    if ('city' in body)
      updatePayload.city = body.city?.trim() || null;
    if ('isActive' in body)
      updatePayload.is_active = !!body.isActive;
    if ('isPromo' in body)
      updatePayload.is_promo = !!body.isPromo;
    if ('sortOrder' in body && Number.isFinite(body.sortOrder))
      updatePayload.sort_order = Number(body.sortOrder);

    const { data, error } = await admin
      .from('cast_members')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/cast-members] update error', error);
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
      .eq('id', id);

    if (error) {
      console.error('[admin/cast-members] delete error', error);
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
