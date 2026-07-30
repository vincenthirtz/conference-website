// POST /api/admin/twitch/eventsub/subscribe
//
// Crée les souscriptions EventSub (transport `websocket`) pour une session
// ouverte PAR LE NAVIGATEUR.
//
// Pourquoi cette route existe : le cockpit régie web lit le chat en IRC ANONYME
// (aucun token dans le navigateur), mais EventSub exige un token utilisateur
// pour créer une souscription. Le token broadcaster ne doit JAMAIS atteindre le
// client. Découpage retenu (identique au flux desktop, coupé en deux) :
//
//   navigateur : ouvre wss://eventsub.wss.twitch.tv/ws → reçoit `session_welcome`
//                → POST { session_id } ici → reçoit ensuite les `notification`
//                frames directement sur SA websocket.
//   serveur    : POST helix/eventsub/subscriptions avec le token broadcaster du
//                tenant (chiffré en base) + `transport.session_id`.
//
// Twitch autorise explicitement ce découplage : la souscription est liée à la
// session websocket, pas au processus qui l'a créée.
//
// Souscriptions répliquées depuis l'app desktop
// (womenscup-caster/src/main/utils/eventsubEvents.js) — on ne souscrit qu'à ce
// que l'IRC ne livre PAS :
//   - channel.follow           v2  → scope moderator:read:followers
//   - channel.shoutout.receive v1  → scope moderator:read:shoutouts
// Condition identique dans les deux cas : le streamer est son propre modérateur
// (`broadcaster_user_id === moderator_user_id === broadcaster_id`).
//
// Le `broadcaster_user_id` vient de `twitch_broadcaster_connections.broadcaster_id`
// (id numérique Twitch, persisté au callback OAuth) — aucun GET /helix/users
// n'est nécessaire ici.
//
// withStaffRoute(..., 'caster') : le cockpit est ouvert à tout staff, comme
// /api/admin/twitch/connection.
//   409 { code:'NOT_CONNECTED' }  — aucune chaîne connectée pour le tenant.
//   403 { code:'MISSING_SCOPE', missing:[...] } — AUCUNE souscription possible.
//   200 { session_id, created, failed, missing_scopes } — succès total OU
//        partiel (un scope peut manquer / une souscription échouer sans
//        empêcher l'autre). `created` = types ACTIFS sur cette session ; un 409
//        Helix (« already exists ») y compte aussi → l'appel est idempotent.
//   502 { code:'TWITCH_HELIX_ERROR' } — Helix injoignable/5xx pour TOUTES les
//        souscriptions tentées.
//
// Consommateur : utils/caster/eventsubClient.ts (navigateur) — il ne lit que
// `created.length` et `failed[0].{status,message}`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  getValidBroadcasterToken,
  helixFetch,
  hasScope,
} from '@/utils/twitchBroadcaster';

/** Souscriptions à créer, avec le scope que Twitch exige pour chacune. */
const EVENTSUB_SUBSCRIPTIONS: readonly {
  type: string;
  version: string;
  scope: string;
}[] = [
  { type: 'channel.follow', version: '2', scope: 'moderator:read:followers' },
  {
    type: 'channel.shoutout.receive',
    version: '1',
    scope: 'moderator:read:shoutouts',
  },
];

/**
 * `session_id` d'une session EventSub websocket : opaque, base64url-ish.
 * Validé au schéma (pas par un `if`) — la valeur part telle quelle dans le
 * corps JSON envoyé à Helix.
 */
const SubscribeSchema = z.object({
  session_id: z
    .string()
    .trim()
    .min(8)
    .max(300)
    .regex(/^[A-Za-z0-9_.=-]+$/, 'session_id has an unexpected format'),
});

/** Une souscription NON créée, avec de quoi l'afficher au caster. */
type FailedEntry = {
  type: string;
  version: string;
  /** Status HTTP Helix, ou 0 si la requête n'a pas abouti (réseau/timeout). */
  status: number;
  message: string;
  code?: 'MISSING_SCOPE';
};

type HelixSubscriptionResponse = {
  message?: string;
  error?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'twitch-eventsub')
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const parsed = SubscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const sessionId: string = parsed.data.session_id;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  } catch (err) {
    logger.error('[admin/twitch/eventsub] token refresh error', err);
    return res.status(502).json({
      error: 'Twitch token unavailable (refresh failed).',
      code: 'TWITCH_TOKEN_ERROR',
    });
  }
  if (!token) {
    return res.status(409).json({
      error: 'Aucune chaîne Twitch connectée.',
      code: 'NOT_CONNECTED',
    });
  }

  // Scopes : on ne rejette en 403 que si AUCUNE souscription n'est possible.
  // Sinon on crée celles dont le scope est accordé et on détaille le reste.
  const granted = EVENTSUB_SUBSCRIPTIONS.filter((s) =>
    hasScope(token.scope, s.scope)
  );
  const missingScopes = EVENTSUB_SUBSCRIPTIONS.filter(
    (s) => !hasScope(token.scope, s.scope)
  ).map((s) => s.scope);

  res.setHeader('Cache-Control', 'private, no-store');

  if (granted.length === 0) {
    return res.status(403).json({
      error: `Scopes manquants : ${missingScopes.join(', ')}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
      missing: missingScopes,
    });
  }

  /** Types de souscription ACTIFS pour cette session (créés ou déjà présents). */
  const created: string[] = [];
  const failed: FailedEntry[] = EVENTSUB_SUBSCRIPTIONS.filter(
    (s) => !hasScope(token.scope, s.scope)
  ).map((s) => ({
    type: s.type,
    version: s.version,
    status: 403,
    message: `Scope manquant : ${s.scope}.`,
    code: 'MISSING_SCOPE' as const,
  }));

  // Nombre d'échecs imputables à Helix (réseau/5xx) — sert à décider du 502.
  let helixDown = 0;

  for (const sub of granted) {
    try {
      const upstream = await helixFetch(
        token.accessToken,
        '/eventsub/subscriptions',
        {
          method: 'POST',
          body: JSON.stringify({
            type: sub.type,
            version: sub.version,
            // Le streamer est son propre modérateur (idem desktop).
            condition: {
              broadcaster_user_id: token.broadcasterId,
              moderator_user_id: token.broadcasterId,
            },
            transport: { method: 'websocket', session_id: sessionId },
          }),
        }
      );

      const json = (await upstream
        .json()
        .catch(() => null)) as HelixSubscriptionResponse | null;

      // 409 = souscription déjà présente sur cette session websocket. L'état
      // voulu est atteint → on la compte comme active (appel idempotent).
      if (upstream.ok || upstream.status === 409) {
        created.push(sub.type);
        continue;
      }

      if (upstream.status >= 500) helixDown += 1;
      logger.error(
        '[admin/twitch/eventsub] subscribe non-OK',
        sub.type,
        upstream.status
      );
      failed.push({
        type: sub.type,
        version: sub.version,
        status: upstream.status,
        message: json?.message || json?.error || `HTTP ${upstream.status}`,
      });
    } catch (err) {
      helixDown += 1;
      logger.error('[admin/twitch/eventsub] subscribe error', sub.type, err);
      failed.push({
        type: sub.type,
        version: sub.version,
        status: 0,
        message: 'Twitch EventSub unreachable.',
      });
    }
  }

  // Helix injoignable (réseau) ou 5xx pour TOUT ce qu'on a tenté → 502.
  if (created.length === 0 && helixDown === granted.length) {
    return res.status(502).json({
      error: 'Twitch EventSub subscription failed.',
      code: 'TWITCH_HELIX_ERROR',
      failed,
    });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'twitch_eventsub',
      entity_id: null,
      tenant_id: ctx.tenantId,
      payload: {
        action: 'subscribe_twitch_eventsub',
        created,
        failed: failed.map((f) => f.type),
        missing_scopes: missingScopes,
      },
    });
  }

  return res.status(200).json({
    session_id: sessionId,
    created,
    failed,
    missing_scopes: missingScopes,
  });
}

export default withStaffRoute(handler, 'caster');
