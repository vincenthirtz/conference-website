// pages/api/admin/broadcast/subscriptions.ts
// Expose au staff qui est abonné / désabonné aux campagnes email (broadcast).
//
// L'opt-out broadcast est GLOBAL par user (une row
// notification_prefs(event_type='broadcast', channel='email', enabled=false)),
// pas par campagne. On agrège les compteurs sur les seuls comptes confirmés
// (cohérent avec l'audience réelle) et on liste les désabonnés confirmés,
// triés par date de désinscription décroissante.
//
// GET → 200 {
//   totalConfirmed, subscribed, unsubscribed,
//   unsubscribedUsers: [{ email, label, unsubscribedAt }]
// }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  computeSubscriptionStats,
  type SubscriptionStats,
} from '@/utils/broadcasts';

import { logger } from '../../../../utils/logger';

export default withStaffRoute(handler, {
  permission: 'manage_broadcast',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  scope: 'platform',
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubscriptionStats | { error: string }>
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-broadcast-subscriptions'
    )
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const stats = await computeSubscriptionStats();
    return res.status(200).json(stats);
  } catch (err: unknown) {
    logger.error('[broadcast/subscriptions] error:', err);
    return res
      .status(500)
      .json({ error: 'Echec du chargement des abonnements' });
  }
}
