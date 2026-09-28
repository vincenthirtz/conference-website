// GET /api/admin/diffusion/twitch-channels
//
// Les chaînes Twitch ACTIVES de l'espace, en lecture seule — pour le statut
// d'antenne de la console live, vu par TOUT le staff de la diffusion.
//
// POURQUOI UNE ROUTE À PART. Le panneau lisait `/api/admin/twitch-channels`,
// qui exige `manage_broadcast` (c'est la route d'ÉDITION de la liste) : pour
// une casteuse, il se masquait — ce sont pourtant elles qui sont à l'antenne.
// La route publique `/api/twitch-channels` résout l'espace par le chemin de
// l'URL, faux pour un staff d'un autre espace. Ici : rôle caster, espace DU
// staff, deux champs par chaîne. Rien de sensible — la liste est publique.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-diffusion-twitch'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const { data, error } = await supabaseAdmin
    .from('twitch_channels')
    .select('channel, label')
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('[admin/diffusion/twitch-channels] lecture impossible', error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const items = (
    (data ?? []) as Array<{ channel: string; label: string | null }>
  )
    .filter((r) => r.channel)
    .map((r) => ({ channel: r.channel, label: r.label ?? null }));
  return res.status(200).json({ items });
}

export default withStaffRoute(handler, 'caster');
