// pages/api/admin/notifications/test.ts
//
// POST /api/admin/notifications/test
//
// Envoie une notification Web Push de test sur TOUTES les subscriptions du
// user staff courant. Utile depuis l'UI /admin/notifications pour vérifier
// qu'un device a bien reçu la PWA + permissions navigateur OK.
//
// Side-effect : si une subscription retourne 404/410 Gone du push service,
// elle est supprimée de la table (l'endpoint est mort côté browser, ne sert
// plus à rien de la garder).
//
// Réponse : { sent, expired_removed, failed } pour exposer les compteurs à
// l'UI (et éviter un 502 si une seule subscription sur N a foiré).

import type { NextApiRequest, NextApiResponse } from 'next';
import webpush from 'web-push';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';

// Env vars are read inside the handler (not at module load) so tests can mutate
// process.env in `beforeEach` without re-importing the module.
const DEFAULT_VAPID_SUBJECT = 'mailto:hirtzvincent@gmail.com';

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 5, windowMs: 60_000 }, 'admin-notif-test')
  ) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vérifie la config VAPID avant tout DB hit : pas d'envoi possible sans clés.
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;
  if (!publicKey || !privateKey) {
    logger.error('[admin/notif/test] VAPID keys missing in env');
    return res.status(500).json({
      error: 'Web Push n’est pas configuré sur ce serveur.',
      code: 'VAPID_NOT_CONFIGURED',
    });
  }

  const authUserId = ctx.user.id;

  const { data: subs, error: loadError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', authUserId);

  if (loadError) {
    logger.error('[admin/notif/test] load subs error', loadError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  const subscriptions = (subs ?? []) as SubscriptionRow[];
  if (subscriptions.length === 0) {
    return res.status(200).json({ sent: 0, expired_removed: 0, failed: 0 });
  }

  const payload = JSON.stringify({
    title: 'Notification de test',
    body: 'Si tu vois ceci, ta PWA est correctement configurée.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: '/admin' },
  });

  const vapidDetails = {
    subject,
    publicKey,
    privateKey,
  };

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
          // Endpoint mort côté push service → la subscription est définitivement
          // expirée, on la purge.
          expiredIds.push(sub.id);
        } else {
          failed += 1;
          logger.error('[admin/notif/test] sendNotification error', {
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
    const { error: deleteError, data: deleted } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('id', expiredIds)
      .select('id');

    if (deleteError) {
      logger.error('[admin/notif/test] purge expired error', deleteError);
      // On ne bloque pas la réponse : les notifs ont quand même été envoyées.
    } else {
      expired_removed = deleted?.length ?? 0;
    }
  }

  return res.status(200).json({ sent, expired_removed, failed });
}

export default withStaffRoute(handler, 'caster');
