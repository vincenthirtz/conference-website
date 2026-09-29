// features/player/notifications/service/push.ts — abonnement Web Push de
// l'appareil de la joueuse (lot P15).
//
// L'enregistrement (garde de réattribution comprise : un endpoint d'une
// autre utilisatrice n'est repris que si ses clés sont celles en base, sinon
// 409 SUBSCRIPTION_OWNED_BY_OTHER_USER) vit dans
// utils/pushSubscriptionUpsert.ts, partagé avec la route admin.
// La révocation ne touche QUE les lignes de l'appelante : une autre rend 404
// (pas d'énumération).

import { LegacyAdminError } from '@/utils/admin/errors';
import { parseBody } from '@/utils/player/errors';
import {
  pushSubscribeBodySchema,
  upsertPushSubscription,
} from '@/utils/pushSubscriptionUpsert';
import * as repo from '../repository';
import { PushUnsubscribeBody } from '../schemas';
import type { NotificationsCtx } from './context';

function invalidBody(error: string, fields?: Record<string, string>) {
  return new LegacyAdminError(400, error, {
    code: 'INVALID_BODY',
    extra: { fields },
  });
}

/** POST /api/player/push/subscribe — 201 à la création, 200 sinon. */
export async function subscribeDevice(ctx: NotificationsCtx, rawBody: unknown) {
  const parsed = parseBody(pushSubscribeBodySchema, rawBody, {
    message: 'Validation échouée.',
  });
  if (!parsed.ok) throw invalidBody(parsed.body.error, parsed.body.fields);
  return upsertPushSubscription({
    authUserId: ctx.userId,
    subscription: parsed.data.subscription,
    userAgent: parsed.data.user_agent,
    logTag: '[player/push/subscribe]',
  });
}

/** DELETE /api/player/push/unsubscribe — 204, ou 404 si pas à elle. */
export async function unsubscribeDevice(
  ctx: NotificationsCtx,
  rawBody: unknown
): Promise<void> {
  const parsed = parseBody(PushUnsubscribeBody, rawBody, {
    message: 'Validation échouée.',
  });
  if (!parsed.ok) throw invalidBody(parsed.body.error, parsed.body.fields);
  const { deleted, error } = await repo.deleteOwnSubscription(
    ctx.db,
    ctx.userId,
    parsed.data.endpoint
  );
  if (error) {
    ctx.logger.error('[player/push/unsubscribe] delete error', error);
    throw new LegacyAdminError(500, 'Erreur serveur.');
  }
  if (deleted === 0) {
    throw new LegacyAdminError(404, 'Subscription introuvable.', {
      code: 'SUBSCRIPTION_NOT_FOUND',
    });
  }
}
