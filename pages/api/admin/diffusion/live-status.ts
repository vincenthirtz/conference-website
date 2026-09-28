// GET /api/admin/diffusion/live-status
//
// « Y a-t-il un run en direct ? » — pour le point rouge de la barre d'onglets
// Diffusion, affiché sur TOUS ses écrans.
//
// POURQUOI UNE ROUTE À PART. Les routes existantes répondent à autre chose :
// `/api/caster/runs/current` sert tous les segments et exige une fiche
// casteuse ; `/api/events/current` est publique et résout l'espace par le
// chemin de l'URL — faux pour un staff qui travaille sur un autre espace ;
// `/api/admin/broadcast/state` est soumise au palier « régie vidéo ». Ici :
// tout le staff, l'espace DU staff, une ligne lue, deux champs rendus.

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
      { max: 120, windowMs: 60_000 },
      'admin-diffusion-live'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const { data, error } = await supabaseAdmin
    .from('event_runs')
    .select('id, name, started_at')
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'live')
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error('[admin/diffusion/live-status] lecture impossible', error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const run = data as { id: string; name: string } | null;
  return res
    .status(200)
    .json({ live: Boolean(run), runName: run?.name ?? null });
}

export default withStaffRoute(handler, 'caster');
