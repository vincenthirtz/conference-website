// features/admin/notifications/service.ts — Web Push du staff connecté.
//
// Tout est scopé au COMPTE de l'appelant (`userId` = auth.users.id) : un
// staff ne lit, n'acquitte, ne désabonne et ne teste que ses propres
// appareils. Rien n'est journalisé : ce sont des gestes sur soi.

import webpush from 'web-push';
import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import { upsertPushSubscription } from '@/utils/pushSubscriptionUpsert';
import { WEB_PUSH_EVENT_TYPES } from '@/utils/webPushEvents';
import * as repo from './repository';
import {
  NotificationPrefsPutBody,
  type NotificationPref,
  PushSubscribeBody,
  PushUnsubscribeBody,
} from './schemas';

const SERVER_ERROR = 'Erreur serveur.';

// Lue à l'appel (pas au chargement du module) : les tests modifient
// process.env dans `beforeEach` sans réimporter.
const DEFAULT_VAPID_SUBJECT = 'mailto:hirtzvincent@gmail.com';

function userIdOf(ctx: ServiceContext): string {
  if (ctx.actor.kind !== 'staff') {
    throw new AdminError(500, 'internal', SERVER_ERROR);
  }
  return ctx.actor.userId;
}

/** Erreur historique d'un corps invalide. */
function parseBody<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Validation échouée.', {
      code: 'INVALID_BODY',
      extra: { fields: parsed.error.flatten().fieldErrors },
    });
  }
  return parsed.data;
}

/* ---- Badge non-lu ---- */

/**
 * Acquitte TOUTES les notifications non lues, tous appareils confondus
 * (l'autre appareil voit le compteur se vider au push suivant). Les `failed`
 * / `expired` non acquittées aussi : pour le compteur, c'est un état « vu ».
 */
export async function ackAll(ctx: ServiceContext) {
  const { ids, error } = await repo.listSubscriptionIds(ctx.db, userIdOf(ctx));
  if (error) {
    ctx.logger.error('[admin/notif/ack-all] load subs error', error);
    throw new AdminError(500, 'internal', SERVER_ERROR);
  }
  if (ids.length === 0) return { count_cleared: 0 };

  const { cleared, error: updateErr } = await repo.ackAll(
    ctx.db,
    ids,
    new Date().toISOString()
  );
  if (updateErr) {
    ctx.logger.error('[admin/notif/ack-all] update error', updateErr);
    throw new AdminError(500, 'internal', SERVER_ERROR);
  }
  return { count_cleared: cleared };
}

/* ---- Abonnement d'un appareil ---- */

/**
 * Enregistre (200) ou crée (201) l'abonnement ; 409 si l'endpoint appartient
 * à un autre compte sans en présenter les clés. La règle vit dans
 * utils/pushSubscriptionUpsert.ts, partagée avec /api/player/push/subscribe :
 * on renvoie son statut et son corps TELS QUELS.
 */
export async function subscribe(ctx: ServiceContext, raw: unknown) {
  const body = parseBody(PushSubscribeBody, raw);
  return upsertPushSubscription({
    authUserId: userIdOf(ctx),
    subscription: body.subscription,
    userAgent: body.user_agent,
    logTag: '[admin/notif/subscribe]',
  });
}

/**
 * Supprime l'abonnement de CET appareil, pour ce compte seulement. 404 aussi
 * pour l'endpoint d'un autre compte : on ne distingue pas « n'existe pas » de
 * « pas à toi » (pas d'énumération).
 */
export async function unsubscribe(ctx: ServiceContext, raw: unknown) {
  const { endpoint } = parseBody(PushUnsubscribeBody, raw);
  const { deleted, error } = await repo.deleteSubscriptionByEndpoint(
    ctx.db,
    userIdOf(ctx),
    endpoint
  );
  if (error) {
    ctx.logger.error('[admin/notif/unsubscribe] delete error', error);
    throw new AdminError(500, 'internal', SERVER_ERROR);
  }
  if (deleted === 0) {
    throw new LegacyAdminError(404, 'Subscription introuvable.', {
      code: 'SUBSCRIPTION_NOT_FOUND',
    });
  }
}

/* ---- Préférences (opt-out : ligne absente = activé) ---- */

function mergeWithDefaults(rows: NotificationPref[]): NotificationPref[] {
  const map = new Map<string, boolean>();
  for (const r of rows) map.set(r.event_type, r.enabled);
  return WEB_PUSH_EVENT_TYPES.map((event_type) => ({
    event_type,
    enabled: map.has(event_type) ? (map.get(event_type) as boolean) : true,
  }));
}

async function loadPrefs(ctx: ServiceContext, userId: string) {
  const { rows, error } = await repo.listPrefs(ctx.db, userId);
  if (error) {
    ctx.logger.error('[admin/notif/prefs] load error', error);
    throw new AdminError(500, 'internal', SERVER_ERROR);
  }
  return { prefs: mergeWithDefaults(rows) };
}

/** Liste EXHAUSTIVE des types d'événement, fusionnée avec les opt-out. */
export async function getPrefs(ctx: ServiceContext) {
  return loadPrefs(ctx, userIdOf(ctx));
}

/**
 * N'écrit que les opt-out : `enabled=false` → ligne, `enabled=true` → pas de
 * ligne (le défaut implicite), ce que lit aussi le dispatcher.
 */
export async function putPrefs(ctx: ServiceContext, raw: unknown) {
  const { prefs } = parseBody(NotificationPrefsPutBody, raw);
  const userId = userIdOf(ctx);

  // Doublons côté client : la dernière entrée gagne.
  const finalState = new Map<string, boolean>();
  for (const p of prefs) finalState.set(p.event_type, p.enabled);

  const toDelete: string[] = [];
  const optOuts: Array<{ event_type: string; updated_at: string }> = [];
  const nowIso = new Date().toISOString();
  for (const [event_type, enabled] of finalState) {
    if (enabled) toDelete.push(event_type);
    else optOuts.push({ event_type, updated_at: nowIso });
  }

  // 1) DELETE de tout ce qui est visé (y compris les opt-out ré-insérés
  //    ensuite) : plus simple qu'un upsert sur PK composite.
  const targeted = [...toDelete, ...optOuts.map((u) => u.event_type)];
  if (targeted.length > 0) {
    const { error } = await repo.deletePrefs(ctx.db, userId, targeted);
    if (error) {
      ctx.logger.error('[admin/notif/prefs] PUT delete error', error);
      throw new AdminError(500, 'internal', SERVER_ERROR);
    }
  }

  // 2) INSERT des opt-out ; unicité garantie par le DELETE + le dédoublonnage.
  if (optOuts.length > 0) {
    const { error } = await repo.insertOptOuts(ctx.db, userId, optOuts);
    if (error) {
      ctx.logger.error('[admin/notif/prefs] PUT insert error', error);
      throw new AdminError(500, 'internal', SERVER_ERROR);
    }
  }

  // 3) L'état complet, pour éviter un refetch client.
  return loadPrefs(ctx, userId);
}

/* ---- Notification de test ---- */

/**
 * Envoie un push de test sur TOUS les appareils du compte. Un endpoint mort
 * (404/410) est purgé ; les autres échecs sont comptés, pas remontés en 502.
 */
export async function sendTest(ctx: ServiceContext) {
  // Configuration VAPID avant tout accès base : pas d'envoi possible sans clés.
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;
  if (!publicKey || !privateKey) {
    ctx.logger.error('[admin/notif/test] VAPID keys missing in env');
    throw new LegacyAdminError(
      500,
      'Web Push n’est pas configuré sur ce serveur.',
      { code: 'VAPID_NOT_CONFIGURED' }
    );
  }

  const { rows: subscriptions, error: loadError } =
    await repo.listSubscriptions(ctx.db, userIdOf(ctx));
  if (loadError) {
    ctx.logger.error('[admin/notif/test] load subs error', loadError);
    throw new AdminError(500, 'internal', SERVER_ERROR);
  }
  if (subscriptions.length === 0) {
    return { sent: 0, expired_removed: 0, failed: 0 };
  }

  const payload = JSON.stringify({
    title: 'Notification de test',
    body: 'Si tu vois ceci, ta PWA est correctement configurée.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: '/admin' },
  });
  const vapidDetails = { subject, publicKey, privateKey };

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  // Envois parallèles : un push service lent ne bloque pas les autres.
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { vapidDetails }
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id);
        } else {
          failed += 1;
          ctx.logger.error('[admin/notif/test] sendNotification error', {
            endpoint: sub.endpoint,
            statusCode,
            err,
          });
        }
      }
    })
  );

  let expired_removed = 0;
  if (expiredIds.length > 0) {
    const { deleted, error } = await repo.deleteSubscriptionsByIds(
      ctx.db,
      expiredIds
    );
    if (error) {
      // Pas bloquant : les notifications sont parties quand même.
      ctx.logger.error('[admin/notif/test] purge expired error', error);
    } else {
      expired_removed = deleted;
    }
  }

  return { sent, expired_removed, failed };
}
