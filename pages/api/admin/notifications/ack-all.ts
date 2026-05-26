// pages/api/admin/notifications/ack-all.ts
//
// POST /api/admin/notifications/ack-all
//
// Marque toutes les notifications Web Push non-lues du staff courant comme
// acknowledged. Le badge taskbar (Badge API V2) se base sur `acked_at IS NULL`
// pour son compteur — un POST ici depuis /admin/notifications remet le
// compteur à zéro.
//
// Scope d'ack :
//   Toutes les subscriptions du user (tous ses devices). Si le staff ack
//   depuis device A, device B verra le compteur clear au prochain push
//   reçu (le SW reçoit `data.unread_count` actualisé dans le payload).
//   Acceptable comme trade-off vs un endpoint par-device qui complique
//   inutilement.
//
// Sécurité :
//   `withStaffRoute('caster')` — n'importe quel rôle staff peut ack ses
//   propres notifs (un caster comme un admin).

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
      { max: 30, windowMs: 60_000 },
      'admin-notif-ack-all'
    )
  ) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authUserId = ctx.user.id;

  // 1. Lister les subscription_ids du user.
  const { data: subs, error: subsErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', authUserId);

  if (subsErr) {
    logger.error('[admin/notif/ack-all] load subs error', subsErr);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  if (!subs || subs.length === 0) {
    return res.status(200).json({ count_cleared: 0 });
  }

  const subscriptionIds = subs.map((s) => s.id);
  const now = new Date().toISOString();

  // 2. Update toutes les deliveries non-acked pour ces subs.
  // Note : on update même les `failed` / `expired` non-acked — le compteur
  // ne fait pas la différence côté UX, et c'est un état "vu" à plat.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('web_push_deliveries')
    .update({ acked_at: now })
    .in('subscription_id', subscriptionIds)
    .is('acked_at', null)
    .select('id');

  if (updateErr) {
    logger.error('[admin/notif/ack-all] update error', updateErr);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res.status(200).json({ count_cleared: updated?.length ?? 0 });
}

export default withStaffRoute(handler, 'caster');
