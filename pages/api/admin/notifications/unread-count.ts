// pages/api/admin/notifications/unread-count.ts
//
// GET /api/admin/notifications/unread-count
//
// Renvoie le nombre de notifications Web Push délivrées mais non-acked pour
// le user staff courant. Source de vérité pour `setAppBadge(n)` côté SW
// quand l'app est ouverte (le SW n'a pas accès à la session, donc il ne
// peut pas calculer le count tout seul — il s'appuie sur `data.unread_count`
// du dernier push reçu, ou ce que le client lui passe via postMessage).
//
// Réponse : `{ count: number }`.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';

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
      'admin-notif-unread-count'
    )
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authUserId = ctx.user.id;

  // Subs du user → count deliveries unacked sur ces subs.
  // En PostgREST/supabase-js v2 : on filtre via .in() sur un sous-select n'est
  // pas direct → on fait 2 queries (subs ids puis count). Trade-off : 1 RTT
  // de plus, mais lisible et profite de l'index partiel
  // `idx_web_push_deliveries_unacked`.
  const { data: subs, error: subsErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', authUserId);

  if (subsErr) {
    logger.error('[admin/notif/unread-count] load subs error', subsErr);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  if (!subs || subs.length === 0) {
    return res.status(200).json({ count: 0 });
  }

  const subscriptionIds = subs.map((s) => s.id);

  const { count, error: countErr } = await supabaseAdmin
    .from('web_push_deliveries')
    .select('id', { count: 'exact', head: true })
    .in('subscription_id', subscriptionIds)
    .eq('status', 'delivered')
    .is('acked_at', null);

  if (countErr) {
    logger.error('[admin/notif/unread-count] count error', countErr);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res.status(200).json({ count: count ?? 0 });
}

export default withStaffRoute(handler, 'caster');
