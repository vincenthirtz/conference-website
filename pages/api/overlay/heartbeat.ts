// POST /api/overlay/heartbeat — « cet overlay est affiché ».
//
// Appelée toutes les 30 s par chaque page `/overlay/*` (hook
// `useOverlayHeartbeat`), SANS authentification : les overlays vivent dans
// OBS, sans session. Voir la migration `overlay_heartbeats.sql` pour le
// modèle et la limite assumée (un signal peut être simulé).
//
// L'espace se résout comme pour les données de l'overlay : `?tenant=<slug>`
// (que l'overlay recopie de sa propre URL), sinon l'espace par défaut.
//
// 204 sur une écriture réussie ; l'overlay ignore toute erreur — un signal
// perdu ne doit JAMAIS casser un affichage à l'antenne.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { isOverlaySource } from '@/utils/overlays/heartbeat';
import { logger } from '@/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Un overlay signale toutes les 30 s ; une régie en ouvre une dizaine.
  if (
    applyRateLimit(
      req,
      res,
      { max: 120, windowMs: 60_000 },
      'overlay-heartbeat'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const source = (req.body as { source?: unknown } | undefined)?.source;
  if (!isOverlaySource(source)) {
    return res.status(400).json({ error: 'Source invalide.', code: 'source' });
  }
  if (!supabaseAdmin) return res.status(503).end();

  let tenantId: string;
  try {
    tenantId = await resolveTenantIdForPublicRequestAsync(req);
  } catch {
    return res.status(503).end();
  }

  const { error } = await supabaseAdmin
    .from('overlay_heartbeats')
    .upsert(
      { tenant_id: tenantId, source, last_seen_at: new Date().toISOString() },
      { onConflict: 'tenant_id,source' }
    );
  if (error) {
    logger.warn('[overlay/heartbeat] écriture impossible: %s', error.message);
    return res.status(500).end();
  }
  return res.status(204).end();
}
