// pages/api/auth/discord-link.ts
// GET    → renvoie l'état du lien Discord pour l'utilisateur connecté
// DELETE → supprime le lien (pour relier un autre compte Discord par exemple)

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerClient, supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '../../../utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'discord-link'))
    return;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const supabase = getServerClient(req, res);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('user_discord_links')
      .select('discord_user_id, discord_username, linked_at')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.error('[discord-link] get error', error);
      return res.status(500).json({ error: 'Erreur de lecture' });
    }

    return res.status(200).json({
      linked: !!data,
      discordUserId: data?.discord_user_id ?? null,
      discordUsername: data?.discord_username ?? null,
      linkedAt: data?.linked_at ?? null,
    });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', user.id);

    if (error) {
      logger.error('[discord-link] delete error', error);
      return res.status(500).json({ error: 'Échec de la suppression' });
    }
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
