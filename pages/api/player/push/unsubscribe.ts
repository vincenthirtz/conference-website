// pages/api/player/push/unsubscribe.ts
//
// DELETE /api/player/push/unsubscribe
//
// Supprime une subscription Web Push pour le user player courant. Le client
// passe l'endpoint à révoquer (typiquement après `pushSubscription.unsubscribe()`).
//
// Sécurité : on ne supprime que les rows où user_id = current auth user.
// Tenter de supprimer une sub d'un autre user retourne 404 (volontaire, pas
// de leak d'énumération).

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().url('endpoint must be a valid URL').max(2048),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'player-push-unsub')
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

  const { data: deleted, error: deleteError } = await supabaseAdmin!
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', authUserId)
    .select('id');

  if (deleteError) {
    logger.error('[player/push/unsubscribe] delete error', deleteError);
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

export default withAuthRoute(handler);
