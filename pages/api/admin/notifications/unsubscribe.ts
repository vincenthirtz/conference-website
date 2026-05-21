// pages/api/admin/notifications/unsubscribe.ts
//
// DELETE /api/admin/notifications/unsubscribe
//
// Supprime une subscription Web Push pour le user staff courant. Le browser
// nous passe l'endpoint à révoquer (typiquement après un
// `pushSubscription.unsubscribe()` côté client).
//
// Sécurité : on ne supprime que les rows où user_id = current_auth_user_id.
// Tenter de supprimer la subscription d'un autre user retourne 404 (volontaire :
// on ne distingue pas "n'existe pas" et "appartient à quelqu'un d'autre" pour
// ne pas leaker d'info d'enumeration).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().url('endpoint must be a valid URL').max(2048),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'admin-notif-unsubscribe'
    )
  ) {
    return;
  }

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = unsubscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { endpoint } = parsed.data;
  const authUserId = ctx.user.id;

  const { data: deleted, error: deleteError } = await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', authUserId)
    .select('id');

  if (deleteError) {
    logger.error('[admin/notif/unsubscribe] delete error', deleteError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  if (!deleted || deleted.length === 0) {
    return res.status(404).json({
      error: 'Subscription introuvable.',
      code: 'SUBSCRIPTION_NOT_FOUND',
    });
  }

  return res.status(204).end();
}

export default withStaffRoute(handler, 'caster');
