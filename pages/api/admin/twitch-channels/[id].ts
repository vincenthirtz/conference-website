import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { getStaffContextFromRequest, hasAtLeastRole } from '@/utils/staff';

type TwitchChannelPayload = {
  channel?: string;
  label?: string;
  badge?: string | null;
  description?: string | null;
  backgroundUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Service Supabase indisponible (service role manquant).' });
  }
  const admin = supabaseAdmin!;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID manquant.' });
  }

  const ctx = await getStaffContextFromRequest(req, res);
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res.status(403).json({ error: 'Accès réservé aux admins.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('twitch_channels')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admin/twitch-channels] get error', error);
      return res
        .status(404)
        .json({ error: 'Chaîne introuvable ou inaccessible.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as TwitchChannelPayload;
    const updatePayload: Record<string, any> = {};

    if (typeof body.channel === 'string')
      updatePayload.channel = body.channel.trim().toLowerCase();
    if (typeof body.label === 'string')
      updatePayload.label = body.label.trim();
    if ('badge' in body)
      updatePayload.badge = body.badge?.trim() || null;
    if ('description' in body)
      updatePayload.description = body.description?.trim() || null;
    if ('backgroundUrl' in body)
      updatePayload.background_url = body.backgroundUrl?.trim() || null;
    if ('isActive' in body) updatePayload.is_active = !!body.isActive;
    if ('sortOrder' in body && Number.isFinite(body.sortOrder))
      updatePayload.sort_order = Number(body.sortOrder);

    const { data, error } = await admin
      .from('twitch_channels')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/twitch-channels] update error', error);
      if (error.code === '23505') {
        return res
          .status(400)
          .json({ error: 'Cette chaîne existe déjà.' });
      }
      return res
        .status(500)
        .json({ error: 'Impossible de mettre à jour la chaîne.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await admin
      .from('twitch_channels')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admin/twitch-channels] delete error', error);
      return res
        .status(500)
        .json({ error: 'Impossible de supprimer la chaîne.' });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
