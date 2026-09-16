// pages/api/admin/notifications/subscribe.ts
//
// POST /api/admin/notifications/subscribe
//
// Enregistre (ou met à jour) une subscription Web Push pour le user staff
// courant et le device courant. L'identifiant naturel est `endpoint` (URL du
// push service du browser : Mozilla / Google / Apple).
//
// Idempotent par endpoint :
//   - endpoint déjà connu → UPDATE (clés, user_agent, last_seen_at). 200.
//   - sinon → INSERT. 201.
//
// Réattribution d'un endpoint enregistré par un AUTRE compte : seulement si les
// clés p256dh/auth présentées sont celles en base (même navigateur qui change
// de compte : « appareil prêté », re-login). Sinon 409
// SUBSCRIPTION_OWNED_BY_OTHER_USER. Avant, l'endpoint seul suffisait : un
// compte staff pouvait détourner les notifications de n'importe quel appareil
// de la table — y compris celui d'une joueuse, puisque la table est commune
// avec /api/player/push/subscribe. La règle vit dans
// utils/pushSubscriptionUpsert.ts, partagée par les deux routes.
//
// L'auth (et donc le user_id à enregistrer) est garantie par withStaffRoute ;
// l'écriture passe par supabaseAdmin (cf. le module partagé pour le pourquoi).

import type { NextApiRequest, NextApiResponse } from 'next';

import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  pushSubscribeBodySchema,
  upsertPushSubscription,
} from '@/utils/pushSubscriptionUpsert';

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
      'admin-notif-subscribe'
    )
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
    // auth.users.id — FK target pour push_subscriptions.user_id.
    authUserId: ctx.user.id,
    subscription: parsed.data.subscription,
    userAgent: parsed.data.user_agent,
    logTag: '[admin/notif/subscribe]',
  });
  return res.status(result.status).json(result.body);
}

// `caster` est le rôle minimum : tout staff doit pouvoir s'abonner aux Web
// Push depuis sa PWA, indépendamment de son niveau de permissions admin.
export default withStaffRoute(handler, 'caster');
