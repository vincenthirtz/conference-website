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
// Idempotent par endpoint : 201 à la création, 200 sur un endpoint connu.
//
// Réattribution d'un endpoint d'une autre utilisatrice : uniquement si les clés
// p256dh/auth présentées sont celles en base, sinon 409
// SUBSCRIPTION_OWNED_BY_OTHER_USER. La logique (garde comprise) vit dans
// utils/pushSubscriptionUpsert.ts, partagée avec la route admin : une seule
// règle pour une seule table.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';

import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  pushSubscribeBodySchema,
  upsertPushSubscription,
} from '@/utils/pushSubscriptionUpsert';

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

  const parsed = pushSubscribeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await upsertPushSubscription({
    authUserId: ctx.user.id,
    subscription: parsed.data.subscription,
    userAgent: parsed.data.user_agent,
    logTag: '[player/push/subscribe]',
  });
  return res.status(result.status).json(result.body);
}

export default withAuthRoute(handler);
