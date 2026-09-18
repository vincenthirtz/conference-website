// /api/admin/twitch/eventsub/alerts
//
// Les abonnements EventSub qui nourrissent la boîte d'alertes.
//
//   GET    → ce qui est abonné aujourd'hui, et ce qui manque (scopes compris).
//   POST   → crée les abonnements manquants.
//   DELETE → les supprime tous.
//
// POURQUOI CETTE ROUTE EXISTE : le récepteur `pages/api/webhooks/twitch/
// alerts.ts` est signé et testé, mais RIEN ne crée les abonnements qui le
// nourrissent. Sans ce qui suit, il ne reçoit jamais rien — sans erreur, sans
// trace, et on ne s'en aperçoit qu'au premier direct sans alertes.
//
// JETON D'APPLICATION, PAS JETON DE CHAÎNE — l'inversion contre-intuitive
// documentée dans `eventsub/tcg-drop.ts` : Twitch exige un app access token
// (`client_credentials`) pour le transport webhook, là où le transport
// websocket veut un jeton utilisateur. La CONDITION, elle, porte le
// `broadcaster_user_id`, donc les scopes doivent avoir été accordés par la
// chaîne.
//
// UN ÉCHEC PARTIEL EST UN RÉSULTAT, PAS UNE ERREUR. Les scopes manquants ne
// concernent que certains types (`channel:read:subscriptions` pour les subs,
// `bits:read` pour les bits) : on crée ce qu'on peut, et on RAPPORTE le reste
// type par type. Tout refuser parce qu'il manque `bits:read` priverait la
// chaîne de ses follows et de ses raids pour rien.
//
// CE QUI EN DÉCOULE POUR LA RÉGIE : tant que la chaîne n'a pas été reconnectée
// avec les nouveaux scopes, la boîte annonce follows, raids et dons — et le
// GET dit précisément pourquoi le reste manque.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { getAccessToken, clientCreds } from '@/utils/twitch';
import { getValidBroadcasterToken, hasScope } from '@/utils/twitchBroadcaster';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { logger } from '@/utils/logger';
import { EVENTSUB_SECRET_ENV } from '@/utils/twitch/eventsubRequest';
import { ALERT_SUBSCRIPTIONS } from '@/utils/twitch/alertEventMapping';

const HELIX_EVENTSUB = 'https://api.twitch.tv/helix/eventsub/subscriptions';

type HelixSub = {
  id?: string;
  status?: string;
  type?: string;
  condition?: Record<string, unknown>;
  transport?: { method?: string; callback?: string };
};

function callbackUrl(): string {
  return absoluteSiteUrl('/api/webhooks/twitch/alerts');
}

/** Les abonnements de CETTE route, chez Twitch. */
async function listOurSubscriptions(
  clientId: string,
  appToken: string
): Promise<HelixSub[] | null> {
  try {
    const upstream = await fetch(`${HELIX_EVENTSUB}?status=enabled`, {
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${appToken}`,
      },
    });
    if (!upstream.ok) return null;
    const json = (await upstream.json().catch(() => null)) as {
      data?: HelixSub[];
    } | null;
    const callback = callbackUrl();
    return (json?.data ?? []).filter((s) => s.transport?.callback === callback);
  } catch {
    return null;
  }
}

type PerType = {
  type: string;
  version: string;
  /** `null` quand aucun scope n'est requis (raid entrant). */
  scope: string | null;
  subscribed: boolean;
  missingScope: boolean;
  error?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'twitch-eventsub-alerts'
    )
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const creds = clientCreds();
  if (!creds) {
    return res.status(503).json({
      error: 'Twitch non configuré côté serveur.',
      code: 'TWITCH_NOT_CONFIGURED',
    });
  }

  // La chaîne connectée : son identifiant pour la condition, ses scopes pour
  // PRÉDIRE le refus de Twitch plutôt que le subir.
  const token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  if (!token) {
    return res.status(409).json({
      error: 'Aucune chaîne Twitch connectée pour cet espace.',
      code: 'NOT_CONNECTED',
    });
  }

  const appToken = await getAccessToken();
  if (!appToken) {
    return res.status(502).json({
      error: 'Jeton d’application Twitch indisponible.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }

  const existing = await listOurSubscriptions(creds.id, appToken);
  const existingTypes = new Set((existing ?? []).map((s) => s.type));

  /** L'état de chaque type, scopes compris. */
  const state = (): PerType[] =>
    ALERT_SUBSCRIPTIONS.map((sub) => ({
      type: sub.type,
      version: sub.version,
      scope: sub.scope,
      subscribed: existingTypes.has(sub.type),
      missingScope: sub.scope ? !hasScope(token.scope, sub.scope) : false,
    }));

  /* ---------------------------------------------------------------- GET */
  if (req.method === 'GET') {
    return res.status(200).json({
      callback: callbackUrl(),
      broadcasterLogin: null,
      secretConfigured: Boolean(process.env[EVENTSUB_SECRET_ENV]),
      // `null` = la liste n'a pas pu être lue ; ce n'est pas « rien d'abonné ».
      readable: existing !== null,
      subscriptions: state(),
    });
  }

  /* --------------------------------------------------------------- POST */
  if (req.method === 'POST') {
    const secret = process.env[EVENTSUB_SECRET_ENV];
    if (!secret) {
      // Sans secret partagé, le récepteur rejetterait chaque livraison en 403 :
      // les abonnements seraient créés et inertes.
      return res.status(503).json({
        error: `${EVENTSUB_SECRET_ENV} absent : le récepteur ne pourrait vérifier aucune signature.`,
        code: 'WEBHOOK_SECRET_MISSING',
      });
    }
    const callback = callbackUrl();
    if (!callback.startsWith('https://')) {
      // Twitch appelle NOTRE serveur : depuis localhost, il ne peut pas.
      return res.status(400).json({
        error: `Twitch exige une URL de rappel publique en HTTPS (reçu : ${callback}).`,
        code: 'CALLBACK_NOT_PUBLIC',
      });
    }

    const results: PerType[] = [];
    for (const sub of ALERT_SUBSCRIPTIONS) {
      const missingScope = sub.scope
        ? !hasScope(token.scope, sub.scope)
        : false;
      if (missingScope) {
        // On n'essaie même pas : Twitch répondrait 403, et le message serait
        // moins clair que celui-ci.
        results.push({ ...sub, subscribed: false, missingScope: true });
        continue;
      }

      // Un raid se lit à l'ARRIVÉE : la condition porte `to_broadcaster_user_id`.
      const condition =
        sub.type === 'channel.raid'
          ? { to_broadcaster_user_id: token.broadcasterId }
          : sub.type === 'channel.follow'
            ? {
                broadcaster_user_id: token.broadcasterId,
                // `channel.follow` v2 exige le modérateur, même si c'est la
                // chaîne elle-même.
                moderator_user_id: token.broadcasterId,
              }
            : { broadcaster_user_id: token.broadcasterId };

      try {
        const upstream = await fetch(HELIX_EVENTSUB, {
          method: 'POST',
          headers: {
            'Client-ID': creds.id,
            Authorization: `Bearer ${appToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: sub.type,
            version: sub.version,
            condition,
            transport: { method: 'webhook', callback, secret },
          }),
        });
        const json = (await upstream.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;

        // 409 = déjà abonné pour cette condition : l'état voulu est atteint.
        if (upstream.ok || upstream.status === 409) {
          results.push({ ...sub, subscribed: true, missingScope: false });
        } else {
          const message =
            json?.message || json?.error || `HTTP ${upstream.status}`;
          logger.error(
            '[eventsub/alerts] %s refusé %s %s',
            sub.type,
            upstream.status,
            message
          );
          results.push({
            ...sub,
            subscribed: false,
            missingScope: false,
            error: message,
          });
        }
      } catch (err) {
        logger.error('[eventsub/alerts] %s injoignable', sub.type, err);
        results.push({
          ...sub,
          subscribed: false,
          missingScope: false,
          error: 'Twitch EventSub injoignable.',
        });
      }
    }

    if (ctx.staff?.id) {
      // Journalisé SANS le secret : un journal se relit.
      // Même forme que `eventsub/tcg-drop.ts` : l'action générique porte le
      // détail dans `payload`, plutôt que d'élargir l'énumération des actions
      // (et son dictionnaire de libellés) pour un geste de configuration.
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_eventsub',
        entity_id: null,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'subscribe_alerts',
          created: results.filter((r) => r.subscribed).map((r) => r.type),
          missing_scopes: [
            ...new Set(
              results.filter((r) => r.missingScope).map((r) => r.scope)
            ),
          ].filter(Boolean),
        },
      }).catch((logErr) => {
        logger.error('[eventsub/alerts] log error', logErr);
      });
    }

    return res.status(200).json({
      callback,
      subscriptions: results,
      // Ce que la régie doit lire en premier : ce qui manque, et pourquoi.
      missingScopes: [
        ...new Set(results.filter((r) => r.missingScope).map((r) => r.scope)),
      ].filter(Boolean),
    });
  }

  /* ------------------------------------------------------------- DELETE */
  if (req.method === 'DELETE') {
    if (existing === null) {
      return res.status(502).json({
        error: 'Liste des abonnements illisible.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }
    let removed = 0;
    for (const sub of existing) {
      if (!sub.id) continue;
      try {
        const upstream = await fetch(
          `${HELIX_EVENTSUB}?id=${encodeURIComponent(sub.id)}`,
          {
            method: 'DELETE',
            headers: {
              'Client-ID': creds.id,
              Authorization: `Bearer ${appToken}`,
            },
          }
        );
        if (upstream.ok || upstream.status === 404) removed += 1;
      } catch {
        // Un échec de suppression n'est pas bloquant : l'appel se rejoue.
      }
    }
    return res.status(200).json({ ok: true, removed });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
