// pages/api/player/push/subscribe.ts
//
// POST /api/player/push/subscribe
//
// Enregistre (ou met à jour) une subscription Web Push pour le user player
// courant et son device. Symétrique de /api/admin/notifications/subscribe
// mais ouvert à tout user authentifié (player ou staff — un staff peut
// avoir des notifs "joueuse" s'il est aussi inscrit dans une équipe).
//
// Même table `push_subscriptions` que côté admin : un device a UNE
// subscription par endpoint, le dispatcher decide ensuite quels events
// envoyer en fonction des relations du user (staff role ? membre équipe ?
// capitaine ?).
//
// Idempotent par endpoint (cf. admin subscribe pour la sémantique 200 vs 201).

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().trim().url('endpoint must be a valid URL').max(2048),
    keys: z.object({
      p256dh: z.string().trim().min(1, 'p256dh required').max(512),
      auth: z.string().trim().min(1, 'auth required').max(256),
    }),
  }),
  user_agent: z
    .union([z.string().trim().max(512), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'player-push-sub')
  ) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = subscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { subscription, user_agent } = parsed.data;
  const authUserId = ctx.user.id;
  const nowIso = new Date().toISOString();

  const { data: existing, error: lookupError } = await supabaseAdmin!
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle();

  if (lookupError) {
    logger.error('[player/push/subscribe] lookup error', lookupError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  if (existing?.id) {
    const { data: updated, error: updateError } = await supabaseAdmin!
      .from('push_subscriptions')
      .update({
        user_id: authUserId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent,
        last_seen_at: nowIso,
      })
      .eq('endpoint', subscription.endpoint)
      .select('id, endpoint')
      .maybeSingle();

    if (updateError || !updated) {
      logger.error('[player/push/subscribe] update error', updateError);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
    return res
      .status(200)
      .json({ id: updated.id, endpoint: updated.endpoint, created: false });
  }

  const { data: inserted, error: insertError } = await supabaseAdmin!
    .from('push_subscriptions')
    .insert({
      user_id: authUserId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent,
      last_seen_at: nowIso,
    })
    .select('id, endpoint')
    .maybeSingle();

  if (insertError || !inserted) {
    // Race condition : un INSERT concurrent a déjà créé le row → on retombe
    // sur l'update path.
    if (
      insertError &&
      typeof insertError === 'object' &&
      (insertError as { code?: string }).code === '23505'
    ) {
      const { data: retryUpdated, error: retryError } = await supabaseAdmin!
        .from('push_subscriptions')
        .update({
          user_id: authUserId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent,
          last_seen_at: nowIso,
        })
        .eq('endpoint', subscription.endpoint)
        .select('id, endpoint')
        .maybeSingle();
      if (retryError || !retryUpdated) {
        logger.error('[player/push/subscribe] retry update error', retryError);
        return res.status(500).json({ error: 'Erreur serveur.' });
      }
      return res.status(200).json({
        id: retryUpdated.id,
        endpoint: retryUpdated.endpoint,
        created: false,
      });
    }
    logger.error('[player/push/subscribe] insert error', insertError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res
    .status(201)
    .json({ id: inserted.id, endpoint: inserted.endpoint, created: true });
}

export default withAuthRoute(handler);
