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
//
// Réattribution d'un endpoint d'une autre utilisatrice : uniquement si les clés
// p256dh/auth présentées sont celles en base, sinon 409
// SUBSCRIPTION_OWNED_BY_OTHER_USER (cf. updateExisting).

import { timingSafeEqual } from 'crypto';
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
    .select('id, user_id, p256dh, auth')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle();

  if (lookupError) {
    logger.error('[player/push/subscribe] lookup error', lookupError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  if (existing?.id) {
    return updateExisting(
      res,
      existing as ExistingRow,
      subscription,
      authUserId,
      user_agent,
      nowIso
    );
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
    // sur l'update path, en relisant la ligne pour lui appliquer la MÊME garde
    // de propriété (sinon la course deviendrait un contournement).
    if (
      insertError &&
      typeof insertError === 'object' &&
      (insertError as { code?: string }).code === '23505'
    ) {
      const { data: raced, error: raceLookupError } = await supabaseAdmin!
        .from('push_subscriptions')
        .select('id, user_id, p256dh, auth')
        .eq('endpoint', subscription.endpoint)
        .maybeSingle();
      if (raceLookupError || !raced?.id) {
        logger.error(
          '[player/push/subscribe] retry lookup error',
          raceLookupError
        );
        return res.status(500).json({ error: 'Erreur serveur.' });
      }
      return updateExisting(
        res,
        raced as ExistingRow,
        subscription,
        authUserId,
        user_agent,
        nowIso
      );
    }
    logger.error('[player/push/subscribe] insert error', insertError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res
    .status(201)
    .json({ id: inserted.id, endpoint: inserted.endpoint, created: true });
}

type ExistingRow = {
  id: string;
  user_id: string | null;
  p256dh: string | null;
  auth: string | null;
};

type ParsedSubscription = z.infer<typeof subscribeSchema>['subscription'];

/** Comparaison à temps constant de deux secrets texte (longueurs comprises). */
function sameSecret(a: string | null, b: string): boolean {
  if (typeof a !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Met à jour une souscription déjà connue pour cet endpoint.
 *
 * Garde de propriété : l'endpoint seul ne prouve RIEN. C'est une URL qui fuit
 * facilement (poste partagé, logs, capture réseau), et la table est partagée
 * avec `/api/admin/notifications/subscribe` — les appareils du staff sont donc
 * concernés. Avant, n'importe quel compte connecté qui présentait l'endpoint
 * d'une autre se l'attribuait : il recevait ses notifications, elle cessait de
 * les recevoir.
 *
 * Ce qui prouve la détention de l'appareil, ce sont les clés `p256dh` + `auth`
 * générées par le navigateur à l'abonnement (`auth` est un secret qui ne sort
 * pas du navigateur, hors notre base). Donc :
 *  - même utilisatrice → mise à jour libre (rafraîchissement des clés compris),
 *    comportement inchangé ;
 *  - autre utilisatrice avec les MÊMES clés → c'est le même navigateur qui
 *    change de compte (« appareil prêté », re-login) : réattribution permise ;
 *  - autre utilisatrice avec des clés différentes → 409, rien n'est modifié.
 *
 * L'UPDATE re-filtre sur la condition vérifiée (user_id, ou clés) : si la ligne
 * a changé entre la lecture et l'écriture, on n'écrase rien et on rend 409.
 */
async function updateExisting(
  res: NextApiResponse,
  existing: ExistingRow,
  subscription: ParsedSubscription,
  authUserId: string,
  userAgent: string | null,
  nowIso: string
) {
  const sameOwner = existing.user_id === authUserId;
  if (
    !sameOwner &&
    !(
      sameSecret(existing.p256dh, subscription.keys.p256dh) &&
      sameSecret(existing.auth, subscription.keys.auth)
    )
  ) {
    return res.status(409).json({
      error: 'Cet appareil est déjà abonné par un autre compte.',
      code: 'SUBSCRIPTION_OWNED_BY_OTHER_USER',
    });
  }

  let query = supabaseAdmin!
    .from('push_subscriptions')
    .update({
      user_id: authUserId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent,
      last_seen_at: nowIso,
    })
    .eq('id', existing.id)
    .eq('endpoint', subscription.endpoint);
  query = sameOwner
    ? query.eq('user_id', authUserId)
    : query
        .eq('p256dh', subscription.keys.p256dh)
        .eq('auth', subscription.keys.auth);

  const { data: updated, error: updateError } = await query
    .select('id, endpoint')
    .maybeSingle();

  if (updateError) {
    logger.error('[player/push/subscribe] update error', updateError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
  if (!updated) {
    // La ligne a changé de mains ou de clés entre la lecture et l'écriture.
    return res.status(409).json({
      error: 'Cet appareil est déjà abonné par un autre compte.',
      code: 'SUBSCRIPTION_OWNED_BY_OTHER_USER',
    });
  }
  return res
    .status(200)
    .json({ id: updated.id, endpoint: updated.endpoint, created: false });
}

export default withAuthRoute(handler);
