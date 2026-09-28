// GET /api/admin/diffusion/overlay-presence
//
// Le dernier signal de chaque overlay de l'espace du staff :
// `{ sources: { <source>: <lastSeenAt ISO> }, now }`. Lu par Diffusion ›
// Overlays et la console live pour afficher « affichée · vue il y a 12 s ».
// `now` est l'heure du SERVEUR : la comparer à l'horloge du poste fausserait
// l'état dès que celle-ci dérive.
//
// Tout le staff (rôle caster) : ce sont eux qui vérifient que l'antenne
// affiche ce qu'elle doit. Lecture seule, aucune donnée sensible.

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
      'admin-overlay-presence'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const { data, error } = await supabaseAdmin
    .from('overlay_heartbeats')
    .select('source, last_seen_at')
    .eq('tenant_id', ctx.tenantId)
    .limit(500);
  if (error) {
    logger.error(
      '[admin/diffusion/overlay-presence] lecture impossible',
      error
    );
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const sources: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{
    source: string;
    last_seen_at: string;
  }>) {
    sources[row.source] = row.last_seen_at;
  }
  return res.status(200).json({ sources, now: new Date().toISOString() });
}

export default withStaffRoute(handler, 'caster');
