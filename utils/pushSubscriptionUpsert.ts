// utils/pushSubscriptionUpsert.ts
//
// Enregistrement d'une subscription Web Push, partagé par les deux routes qui
// écrivent la table `push_subscriptions` :
//   - POST /api/admin/notifications/subscribe (staff, PWA /admin) ;
//   - POST /api/player/push/subscribe (tout compte connecté).
//
// POURQUOI UN MODULE COMMUN. La table est UNE : un endpoint (l'appareil) n'y a
// qu'une ligne, quel que soit l'écran qui l'a enregistrée. La garde de
// propriété corrigée côté joueuse n'avait pas été reportée côté admin : un
// compte staff pouvait encore s'attribuer l'appareil d'une joueuse en
// présentant son seul endpoint. Deux copies de la règle, c'est la garantie
// qu'elles divergent de nouveau ; les routes ne gardent ici que ce qui leur
// est propre (auth, nom du limiteur, étiquette de log).
//
// Idempotent par endpoint : 201 `created: true` à l'insertion, 200
// `created: false` sur un endpoint déjà connu. On passe par supabaseAdmin : une
// réattribution légitime (« appareil prêté ») changerait `user_id` d'une ligne
// que la policy RLS d'update refuserait à l'appelant. C'est précisément parce
// que RLS est contournée que la garde de propriété doit vivre ici.

import { timingSafeEqual } from 'crypto';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Corps accepté par les deux routes (même contrat navigateur `PushSubscription`). */
export const pushSubscribeBodySchema = z.object({
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

export type ParsedPushSubscription = z.infer<
  typeof pushSubscribeBodySchema
>['subscription'];

export const SUBSCRIPTION_OWNED_BY_OTHER_USER =
  'SUBSCRIPTION_OWNED_BY_OTHER_USER';

/** Réponse prête à écrire : chaque route fait `res.status(status).json(body)`. */
export type PushUpsertResult =
  | {
      status: 200 | 201;
      body: { id: string; endpoint: string; created: boolean };
    }
  | { status: 409; body: { error: string; code: string } }
  | { status: 500; body: { error: string } };

type ExistingRow = {
  id: string;
  user_id: string | null;
  p256dh: string | null;
  auth: string | null;
};

const SERVER_ERROR: PushUpsertResult = {
  status: 500,
  body: { error: 'Erreur serveur.' },
};

const OWNED_BY_OTHER: PushUpsertResult = {
  status: 409,
  body: {
    error: 'Cet appareil est déjà abonné par un autre compte.',
    code: SUBSCRIPTION_OWNED_BY_OTHER_USER,
  },
};

/** Comparaison à temps constant de deux secrets texte (longueurs comprises). */
export function sameSecret(a: string | null, b: string): boolean {
  if (typeof a !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Crée ou met à jour la subscription de `authUserId` pour cet endpoint.
 *
 * `logTag` n'influe que sur les logs (`[admin/notif/subscribe]`, …) : garder
 * l'origine lisible dans les journaux d'erreur sans dupliquer la logique.
 */
export async function upsertPushSubscription(params: {
  authUserId: string;
  subscription: ParsedPushSubscription;
  userAgent: string | null;
  logTag: string;
}): Promise<PushUpsertResult> {
  const { authUserId, subscription, userAgent, logTag } = params;
  const nowIso = new Date().toISOString();

  const { data: existing, error: lookupError } = await supabaseAdmin!
    .from('push_subscriptions')
    .select('id, user_id, p256dh, auth')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle();

  if (lookupError) {
    logger.error(`${logTag} lookup error`, lookupError);
    return SERVER_ERROR;
  }

  if (existing?.id) {
    return updateExisting(
      existing as ExistingRow,
      subscription,
      authUserId,
      userAgent,
      nowIso,
      logTag
    );
  }

  const { data: inserted, error: insertError } = await supabaseAdmin!
    .from('push_subscriptions')
    .insert({
      user_id: authUserId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent,
      last_seen_at: nowIso,
    })
    .select('id, endpoint')
    .maybeSingle();

  if (insertError || !inserted) {
    // Course : un INSERT concurrent a créé la ligne entre notre lecture et
    // notre écriture. On relit la ligne pour lui appliquer la MÊME garde de
    // propriété — un UPDATE direct ferait de la course un contournement.
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
        logger.error(`${logTag} retry lookup error`, raceLookupError);
        return SERVER_ERROR;
      }
      return updateExisting(
        raced as ExistingRow,
        subscription,
        authUserId,
        userAgent,
        nowIso,
        logTag
      );
    }
    logger.error(`${logTag} insert error`, insertError);
    return SERVER_ERROR;
  }

  return {
    status: 201,
    body: { id: inserted.id, endpoint: inserted.endpoint, created: true },
  };
}

/**
 * Met à jour une souscription déjà connue pour cet endpoint.
 *
 * Garde de propriété : l'endpoint seul ne prouve RIEN. C'est une URL qui fuit
 * facilement (poste partagé, logs, capture réseau). Avant, n'importe quel
 * compte qui la présentait s'attribuait l'appareil : il recevait les
 * notifications de la victime, elle cessait de les recevoir.
 *
 * Ce qui prouve la détention de l'appareil, ce sont les clés `p256dh` + `auth`
 * générées par le navigateur à l'abonnement (`auth` est un secret qui ne sort
 * pas du navigateur, hors notre base). Donc :
 *  - même utilisateur → mise à jour libre (rafraîchissement des clés compris) ;
 *  - autre utilisateur avec les MÊMES clés → c'est le même navigateur qui
 *    change de compte (« appareil prêté », re-login) : réattribution permise ;
 *  - autre utilisateur avec des clés différentes → 409, rien n'est modifié.
 *
 * L'UPDATE re-filtre sur la condition vérifiée (user_id, ou clés) : si la ligne
 * a changé entre la lecture et l'écriture, on n'écrase rien et on rend 409.
 */
async function updateExisting(
  existing: ExistingRow,
  subscription: ParsedPushSubscription,
  authUserId: string,
  userAgent: string | null,
  nowIso: string,
  logTag: string
): Promise<PushUpsertResult> {
  const sameOwner = existing.user_id === authUserId;
  if (
    !sameOwner &&
    !(
      sameSecret(existing.p256dh, subscription.keys.p256dh) &&
      sameSecret(existing.auth, subscription.keys.auth)
    )
  ) {
    return OWNED_BY_OTHER;
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
    logger.error(`${logTag} update error`, updateError);
    return SERVER_ERROR;
  }
  if (!updated) {
    // La ligne a changé de mains ou de clés entre la lecture et l'écriture.
    return OWNED_BY_OTHER;
  }
  return {
    status: 200,
    body: { id: updated.id, endpoint: updated.endpoint, created: false },
  };
}
