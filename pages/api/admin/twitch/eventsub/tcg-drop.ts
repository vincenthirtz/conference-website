// /api/admin/twitch/eventsub/tcg-drop
//
// L'abonnement EventSub qui fait vivre le drop TCG en direct.
//
//   GET    → l'état : récompense désignée, abonnement webhook présent ou non.
//   POST   → désigne une récompense ET crée l'abonnement.
//   DELETE → supprime l'abonnement (la récompense désignée reste).
//
// POURQUOI CETTE ROUTE EXISTE. Le récepteur `pages/api/webhooks/twitch/
// tcg-drop.ts` est livré, signé et testé — mais RIEN ne créait l'abonnement qui
// le nourrit. La seule route EventSub du dépôt (`subscribe.ts`) utilise le
// transport `websocket`, lié à une session de navigateur de régie : elle
// n'alimente pas un récepteur serveur. Sans ce qui suit, le webhook ne recevait
// simplement jamais rien, quelle que soit la configuration côté Twitch.
//
// DEUX TRANSPORTS, DEUX MONDES. `websocket` meurt avec l'onglet ; `webhook`
// survit au cockpit fermé — c'est précisément ce qu'on veut d'un drop qui doit
// tomber pendant un live sans personne devant l'écran.
//
// JETON D'APPLICATION, PAS JETON DE CHAÎNE. Twitch exige un app access token
// (`client_credentials`) pour les abonnements webhook, là où le transport
// websocket veut un jeton utilisateur. C'est une inversion contre-intuitive, et
// s'y tromper rend un 401 que rien n'explique. La CONDITION, elle, porte
// toujours le `broadcaster_user_id` — le scope `channel:read:redemptions` doit
// donc avoir été accordé par la chaîne, sinon Twitch refuse l'abonnement.
//
// LA RÉCOMPENSE EST DANS LA CONDITION. `condition.reward_id` limite les
// notifications à CETTE récompense : sans lui, tout échange de points de la
// chaîne nous arriverait, et « mettre en avant mon message » donnerait une
// carte. Le webhook refiltre de son côté — deux ceintures, parce qu'un
// abonnement recréé à la main un jour sans condition repasserait sinon en mode
// « tout donner » sans que rien ne le signale.
//
// LE SECRET EST OBLIGATOIRE. `TWITCH_EVENTSUB_SECRET` est la clé HMAC que
// Twitch utilisera pour signer chaque livraison, et que le récepteur vérifie.
// Créer un abonnement sans lui produirait un flux que notre webhook rejetterait
// en 403 à chaque message : on refuse en amont plutôt que de livrer une
// souscription inerte.
//
// L'URL DE RAPPEL DOIT ÊTRE PUBLIQUE ET EN HTTPS. Twitch appelle notre serveur,
// pas l'inverse : depuis `localhost`, la création échoue côté Twitch avec un
// message peu clair. On le dit ici, en 400, plutôt que de laisser chercher.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
// `getAccessToken` = jeton d'APPLICATION (client_credentials), celui qu'exige
// un abonnement EventSub en transport webhook. Il porte déjà un cache avec
// marge d'une minute : rien à gérer ici.
import { getAccessToken } from '@/utils/twitch';
import { getValidBroadcasterToken, hasScope } from '@/utils/twitchBroadcaster';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { logger } from '@/utils/logger';

const TABLE = 'twitch_broadcaster_connections';
const HELIX_EVENTSUB = 'https://api.twitch.tv/helix/eventsub/subscriptions';

/** Le type d'événement écouté par `pages/api/webhooks/twitch/tcg-drop.ts`. */
const SUBSCRIPTION_TYPE = 'channel.channel_points_custom_reward_redemption.add';
const SUBSCRIPTION_VERSION = '1';

/** Scope que la chaîne doit avoir accordé pour que Twitch accepte l'abonnement. */
const REQUIRED_SCOPE = 'channel:read:redemptions';

const BodySchema = z.object({
  /** Identifiant Twitch de la récompense à écouter. */
  rewardId: z.string().trim().min(1).max(200),
});

/** L'URL que Twitch appellera. Publique et HTTPS, sans quoi il refuse. */
function callbackUrl(): string {
  return absoluteSiteUrl('/api/webhooks/twitch/tcg-drop');
}

type HelixSub = {
  id?: string;
  status?: string;
  type?: string;
  condition?: { reward_id?: string };
  transport?: { method?: string; callback?: string };
};

/** Nos abonnements webhook de ce type, quel que soit leur état. */
async function listOurSubscriptions(
  appToken: string,
  clientId: string
): Promise<HelixSub[] | null> {
  try {
    const res = await fetch(
      `${HELIX_EVENTSUB}?type=${encodeURIComponent(SUBSCRIPTION_TYPE)}`,
      {
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${appToken}`,
        },
      }
    );
    if (!res.ok) {
      logger.error('[eventsub/tcg-drop] list non-OK %s', res.status);
      return null;
    }
    const json = (await res.json()) as { data?: HelixSub[] };
    const ours = callbackUrl();
    return (json.data ?? []).filter(
      (s) => s.transport?.method === 'webhook' && s.transport?.callback === ours
    );
  } catch (err) {
    logger.error('[eventsub/tcg-drop] list error', err);
    return null;
  }
}

async function readRewardId(tenantId: string): Promise<string | null> {
  const { data } = await supabaseAdmin!
    .from(TABLE)
    .select('tcg_reward_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const value = (data as { tcg_reward_id?: unknown } | null)?.tcg_reward_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'twitch-es-tcg')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const secret = process.env.TWITCH_EVENTSUB_SECRET?.trim();
  const creds = { id: process.env.TWITCH_CLIENT_ID?.trim() };
  if (!creds.id) {
    return res
      .status(503)
      .json({ error: 'Twitch non configuré.', code: 'TWITCH_NOT_CONFIGURED' });
  }

  // La chaîne connectée : on a besoin de son identifiant pour la condition, et
  // de ses scopes pour prédire le refus de Twitch plutôt que le subir.
  const token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  if (!token) {
    return res.status(409).json({
      error: 'Aucune chaîne Twitch connectée.',
      code: 'NOT_CONNECTED',
    });
  }

  const appToken = await getAccessToken();
  if (!appToken) {
    return res.status(502).json({
      error: 'Jeton applicatif Twitch indisponible.',
      code: 'TWITCH_TOKEN_ERROR',
    });
  }

  /* ---------------------------------------------------------------- GET */
  if (req.method === 'GET') {
    const subs = await listOurSubscriptions(appToken, creds.id);
    return res.status(200).json({
      rewardId: await readRewardId(ctx.tenantId),
      callbackUrl: callbackUrl(),
      secretConfigured: Boolean(secret),
      hasScope: hasScope(token.scope, REQUIRED_SCOPE),
      subscriptions:
        subs?.map((s) => ({
          id: s.id ?? null,
          status: s.status ?? null,
          rewardId: s.condition?.reward_id ?? null,
        })) ?? null,
    });
  }

  /* --------------------------------------------------------------- POST */
  if (req.method === 'POST') {
    const parsed = BodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Identifiant de récompense manquant.',
        code: 'INVALID_BODY',
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    const { rewardId } = parsed.data;

    if (!secret) {
      // Sans secret partagé, le récepteur rejetterait chaque livraison en 403 :
      // l'abonnement serait créé et inerte. On refuse en amont.
      return res.status(503).json({
        error:
          'TWITCH_EVENTSUB_SECRET absent : le récepteur ne pourrait vérifier aucune signature.',
        code: 'WEBHOOK_SECRET_MISSING',
      });
    }
    const callback = callbackUrl();
    if (!callback.startsWith('https://')) {
      // Twitch appelle NOTRE serveur : depuis localhost, il ne peut pas.
      return res.status(400).json({
        error: `Twitch exige une URL de rappel publique en HTTPS (reçu : ${callback}). Impossible depuis un poste local.`,
        code: 'CALLBACK_NOT_PUBLIC',
      });
    }
    if (!hasScope(token.scope, REQUIRED_SCOPE)) {
      return res.status(403).json({
        error: `Scope manquant : ${REQUIRED_SCOPE}. Reconnecte la chaîne.`,
        code: 'MISSING_SCOPE',
        missing: [REQUIRED_SCOPE],
      });
    }

    // La récompense d'abord : si l'abonnement échoue, la désignation reste et
    // l'appel se rejoue sans rien ressaisir. L'inverse laisserait un abonnement
    // actif que le webhook refuserait, faute de récompense désignée.
    const { error: saveErr } = await supabaseAdmin
      .from(TABLE)
      .update({ tcg_reward_id: rewardId, updated_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenantId);
    if (saveErr) {
      logger.error('[eventsub/tcg-drop] récompense non enregistrée', saveErr);
      return res.status(500).json({ error: 'Enregistrement impossible.' });
    }

    let upstreamStatus = 0;
    let upstreamMessage = '';
    try {
      const upstream = await fetch(HELIX_EVENTSUB, {
        method: 'POST',
        headers: {
          'Client-ID': creds.id,
          Authorization: `Bearer ${appToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: SUBSCRIPTION_TYPE,
          version: SUBSCRIPTION_VERSION,
          condition: {
            broadcaster_user_id: token.broadcasterId,
            // Limite les notifications à CETTE récompense — cf. l'en-tête.
            reward_id: rewardId,
          },
          transport: { method: 'webhook', callback, secret },
        }),
      });
      upstreamStatus = upstream.status;
      const json = (await upstream.json().catch(() => null)) as {
        message?: string;
        error?: string;
        data?: HelixSub[];
      } | null;
      upstreamMessage = json?.message || json?.error || '';

      // 409 = abonnement déjà présent pour cette condition. L'état voulu est
      // atteint : l'appel est idempotent.
      if (!upstream.ok && upstream.status !== 409) {
        logger.error(
          '[eventsub/tcg-drop] création refusée %s %s',
          upstream.status,
          upstreamMessage
        );
        return res.status(502).json({
          error: `Twitch a refusé l'abonnement (${upstream.status}). ${upstreamMessage}`,
          code: 'TWITCH_HELIX_ERROR',
          rewardId,
        });
      }
    } catch (err) {
      logger.error('[eventsub/tcg-drop] création injoignable', err);
      return res.status(502).json({
        error: 'Twitch EventSub injoignable.',
        code: 'TWITCH_HELIX_ERROR',
        rewardId,
      });
    }

    if (ctx.staff?.id) {
      // Journalisé SANS le secret : un journal se relit.
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'other',
          entity_type: 'twitch_eventsub',
          entity_id: null,
          tenant_id: ctx.tenantId,
          payload: {
            action: 'subscribe_tcg_drop',
            reward_id: rewardId,
            already_existed: upstreamStatus === 409,
          },
        });
      } catch (logErr) {
        logger.error('[eventsub/tcg-drop] log error', logErr);
      }
    }

    const subs = await listOurSubscriptions(appToken, creds.id);
    return res.status(200).json({
      rewardId,
      callbackUrl: callback,
      alreadyExisted: upstreamStatus === 409,
      subscriptions:
        subs?.map((s) => ({
          id: s.id ?? null,
          status: s.status ?? null,
          rewardId: s.condition?.reward_id ?? null,
        })) ?? null,
    });
  }

  /* ------------------------------------------------------------- DELETE */
  if (req.method === 'DELETE') {
    const subs = await listOurSubscriptions(appToken, creds.id);
    if (subs === null) {
      return res.status(502).json({
        error: 'Twitch EventSub injoignable.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    let removed = 0;
    for (const sub of subs) {
      if (!sub.id) continue;
      try {
        const del = await fetch(
          `${HELIX_EVENTSUB}?id=${encodeURIComponent(sub.id)}`,
          {
            method: 'DELETE',
            headers: {
              'Client-ID': creds.id,
              Authorization: `Bearer ${appToken}`,
            },
          }
        );
        // 404 = déjà absent : l'état voulu est atteint.
        if (del.ok || del.status === 404) removed += 1;
      } catch (err) {
        logger.error('[eventsub/tcg-drop] suppression échouée', sub.id, err);
      }
    }

    if (ctx.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'other',
          entity_type: 'twitch_eventsub',
          entity_id: null,
          tenant_id: ctx.tenantId,
          payload: { action: 'unsubscribe_tcg_drop', removed },
        });
      } catch (logErr) {
        logger.error('[eventsub/tcg-drop] log error', logErr);
      }
    }

    // La récompense désignée reste : supprimer l'abonnement n'est pas oublier
    // quelle récompense on écoutait, et la ressaisir serait une corvée inutile.
    return res.status(200).json({ removed });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
