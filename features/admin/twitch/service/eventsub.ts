// features/admin/twitch/service/eventsub.ts — abonnements EventSub.
//
//   * `subscribe`  : transport WEBSOCKET, session ouverte par le navigateur de
//     la régie ; le serveur souscrit avec le jeton broadcaster (qui ne doit
//     JAMAIS atteindre le client).
//   * `alerts`     : transport WEBHOOK vers /api/webhooks/twitch/alerts.
//   * `tcg-drop`   : transport WEBHOOK vers /api/webhooks/twitch/tcg-drop,
//     conditionné par la récompense désignée.
//
// JETON D'APPLICATION pour le transport webhook (`client_credentials`), jeton
// UTILISATEUR pour le websocket — l'inversion contre-intuitive documentée
// historiquement dans les routes. La CONDITION porte toujours le
// `broadcaster_user_id` : les scopes doivent avoir été accordés par la chaîne.
//
// Le secret HMAC (`TWITCH_EVENTSUB_SECRET`) part chez Twitch dans le corps de
// création et NULLE PART ailleurs : ni réponse, ni journal.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { getAccessToken, clientCreds } from '@/utils/twitch';
import {
  getValidBroadcasterToken,
  hasScope,
  helixFetch,
  type ValidBroadcasterToken,
} from '@/utils/twitchBroadcaster';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { EVENTSUB_SECRET_ENV } from '@/utils/twitch/eventsubRequest';
import { ALERT_SUBSCRIPTIONS } from '@/utils/twitch/alertEventMapping';
import type { Audited } from '../../_shared/audited';
import {
  findTcgRewardIds,
  listFeaturedCandidates,
  saveTcgReward,
} from '../repository';
import { SubscribeSchema, TcgDropSubscribeSchema } from '../schemas';
import {
  fail,
  legacyDb,
  parsePayload,
  readJson,
  requireBroadcasterToken,
} from './common';

const HELIX_EVENTSUB = 'https://api.twitch.tv/helix/eventsub/subscriptions';

type HelixSub = {
  id?: string;
  status?: string;
  type?: string;
  condition?: { reward_id?: string } & Record<string, unknown>;
  transport?: { method?: string; callback?: string };
};

/* ===========================================================================
 * Websocket (cockpit régie) — POST /twitch/eventsub/subscribe
 * ======================================================================== */

/** Souscriptions à créer, avec le scope que Twitch exige pour chacune. */
const WEBSOCKET_SUBSCRIPTIONS: readonly {
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

/** Une souscription NON créée, avec de quoi l'afficher au caster. */
type FailedEntry = {
  type: string;
  version: string;
  /** Status HTTP Helix, ou 0 si la requête n'a pas abouti (réseau/timeout). */
  status: number;
  message: string;
  code?: 'MISSING_SCOPE';
};

export async function subscribeWebsocket(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<
  Audited<{
    session_id: string;
    created: string[];
    failed: FailedEntry[];
    missing_scopes: string[];
  }>
> {
  const sessionId: string = parsePayload(SubscribeSchema, rawBody).session_id;
  const token = await requireBroadcasterToken(ctx, 'admin/twitch/eventsub');

  // Scopes : 403 seulement si AUCUNE souscription n'est possible.
  const granted = WEBSOCKET_SUBSCRIPTIONS.filter((s) =>
    hasScope(token.scope, s.scope)
  );
  const missingScopes = WEBSOCKET_SUBSCRIPTIONS.filter(
    (s) => !hasScope(token.scope, s.scope)
  ).map((s) => s.scope);

  if (granted.length === 0) {
    throw fail(
      403,
      `Scopes manquants : ${missingScopes.join(', ')}. Reconnecte la chaîne.`,
      'MISSING_SCOPE',
      { missing: missingScopes }
    );
  }

  /** Types ACTIFS pour cette session (créés ou déjà présents). */
  const created: string[] = [];
  const failed: FailedEntry[] = WEBSOCKET_SUBSCRIPTIONS.filter(
    (s) => !hasScope(token.scope, s.scope)
  ).map((s) => ({
    type: s.type,
    version: s.version,
    status: 403,
    message: `Scope manquant : ${s.scope}.`,
    code: 'MISSING_SCOPE' as const,
  }));

  // Échecs imputables à Helix (réseau/5xx) — décide du 502.
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
      const json = await readJson<{ message?: string; error?: string }>(
        upstream
      );
      // 409 = déjà présente sur cette session : l'appel est idempotent.
      if (upstream.ok || upstream.status === 409) {
        created.push(sub.type);
        continue;
      }
      if (upstream.status >= 500) helixDown += 1;
      ctx.logger.error(
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
      ctx.logger.error(
        '[admin/twitch/eventsub] subscribe error',
        sub.type,
        err
      );
      failed.push({
        type: sub.type,
        version: sub.version,
        status: 0,
        message: 'Twitch EventSub unreachable.',
      });
    }
  }

  // Helix injoignable ou 5xx pour TOUT ce qu'on a tenté → 502.
  if (created.length === 0 && helixDown === granted.length) {
    throw fail(
      502,
      'Twitch EventSub subscription failed.',
      'TWITCH_HELIX_ERROR',
      {
        failed,
      }
    );
  }

  return {
    result: {
      session_id: sessionId,
      created,
      failed,
      missing_scopes: missingScopes,
    },
    audit: {
      entity_type: 'twitch_eventsub',
      entity_id: null,
      payload: {
        action: 'subscribe_twitch_eventsub',
        created,
        failed: failed.map((f) => f.type),
        missing_scopes: missingScopes,
      },
    },
  };
}

/* ===========================================================================
 * Webhook — outils communs
 * ======================================================================== */

/**
 * Liste Helix (`null` si non-OK). `strictJson` : un corps illisible LÈVE
 * (drop TCG, qui le traitait en échec) au lieu de valoir liste vide (alertes).
 */
async function helixList(
  url: string,
  clientId: string,
  appToken: string,
  strictJson = false
): Promise<HelixSub[] | null> {
  const upstream = await fetch(url, {
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${appToken}` },
  });
  if (!upstream.ok) return null;
  const json = strictJson
    ? ((await upstream.json()) as { data?: HelixSub[] })
    : await readJson<{ data?: HelixSub[] }>(upstream);
  return json?.data ?? [];
}

async function helixDelete(
  id: string,
  clientId: string,
  appToken: string
): Promise<boolean> {
  const upstream = await fetch(
    `${HELIX_EVENTSUB}?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: { 'Client-ID': clientId, Authorization: `Bearer ${appToken}` },
    }
  );
  // 404 = déjà absent : l'état voulu est atteint.
  return upstream.ok || upstream.status === 404;
}

function helixCreate(
  clientId: string,
  appToken: string,
  body: Record<string, unknown>
) {
  return fetch(HELIX_EVENTSUB, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${appToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/* ===========================================================================
 * Alertes — /twitch/eventsub/alerts
 * ======================================================================== */

const alertsCallbackUrl = () => absoluteSiteUrl('/api/webhooks/twitch/alerts');

type AlertPerType = {
  type: string;
  version: string;
  /** `null` quand aucun scope n'est requis (raid entrant). */
  scope: string | null;
  subscribed: boolean;
  missingScope: boolean;
  error?: string;
};

type AlertsContext = {
  creds: { id: string };
  token: ValidBroadcasterToken;
  appToken: string;
  existing: HelixSub[] | null;
};

/** Préalables communs aux trois méthodes, dans l'ordre d'origine. */
async function alertsContext(ctx: ServiceContext): Promise<AlertsContext> {
  const creds = clientCreds();
  if (!creds) {
    throw fail(
      503,
      'Twitch non configuré côté serveur.',
      'TWITCH_NOT_CONFIGURED'
    );
  }
  const token = await getValidBroadcasterToken(legacyDb(ctx), ctx.tenantId);
  if (!token) {
    throw fail(
      409,
      'Aucune chaîne Twitch connectée pour cet espace.',
      'NOT_CONNECTED'
    );
  }
  const appToken = await getAccessToken();
  if (!appToken) {
    throw fail(
      502,
      'Jeton d’application Twitch indisponible.',
      'TWITCH_HELIX_ERROR'
    );
  }
  // Les abonnements de CETTE route, chez Twitch (`null` = illisible).
  let existing: HelixSub[] | null;
  try {
    const all = await helixList(
      `${HELIX_EVENTSUB}?status=enabled`,
      creds.id,
      appToken
    );
    const callback = alertsCallbackUrl();
    existing = all?.filter((s) => s.transport?.callback === callback) ?? null;
  } catch {
    existing = null;
  }
  return { creds, token, appToken, existing };
}

export async function getAlertsState(ctx: ServiceContext) {
  const { token, existing } = await alertsContext(ctx);
  const existingTypes = new Set((existing ?? []).map((s) => s.type));
  return {
    callback: alertsCallbackUrl(),
    broadcasterLogin: null,
    secretConfigured: Boolean(process.env[EVENTSUB_SECRET_ENV]),
    // `null` = la liste n'a pas pu être lue ; ce n'est pas « rien d'abonné ».
    readable: existing !== null,
    subscriptions: ALERT_SUBSCRIPTIONS.map(
      (sub): AlertPerType => ({
        type: sub.type,
        version: sub.version,
        scope: sub.scope,
        subscribed: existingTypes.has(sub.type),
        missingScope: sub.scope ? !hasScope(token.scope, sub.scope) : false,
      })
    ),
  };
}

export async function subscribeAlerts(ctx: ServiceContext): Promise<
  Audited<{
    callback: string;
    subscriptions: AlertPerType[];
    missingScopes: (string | null)[];
  }>
> {
  const { creds, token, appToken } = await alertsContext(ctx);
  const secret = process.env[EVENTSUB_SECRET_ENV];
  if (!secret) {
    // Sans secret partagé, le récepteur rejetterait chaque livraison en 403.
    throw fail(
      503,
      `${EVENTSUB_SECRET_ENV} absent : le récepteur ne pourrait vérifier aucune signature.`,
      'WEBHOOK_SECRET_MISSING'
    );
  }
  const callback = alertsCallbackUrl();
  if (!callback.startsWith('https://')) {
    // Twitch appelle NOTRE serveur : depuis localhost, il ne peut pas.
    throw fail(
      400,
      `Twitch exige une URL de rappel publique en HTTPS (reçu : ${callback}).`,
      'CALLBACK_NOT_PUBLIC'
    );
  }

  const results: AlertPerType[] = [];
  for (const sub of ALERT_SUBSCRIPTIONS) {
    const missingScope = sub.scope ? !hasScope(token.scope, sub.scope) : false;
    if (missingScope) {
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
              // `channel.follow` v2 exige le modérateur, même la chaîne.
              moderator_user_id: token.broadcasterId,
            }
          : { broadcaster_user_id: token.broadcasterId };

    try {
      const upstream = await helixCreate(creds.id, appToken, {
        type: sub.type,
        version: sub.version,
        condition,
        transport: { method: 'webhook', callback, secret },
      });
      const json = await readJson<{ message?: string; error?: string }>(
        upstream
      );
      // 409 = déjà abonné pour cette condition : l'état voulu est atteint.
      if (upstream.ok || upstream.status === 409) {
        results.push({ ...sub, subscribed: true, missingScope: false });
      } else {
        const message =
          json?.message || json?.error || `HTTP ${upstream.status}`;
        ctx.logger.error(
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
      ctx.logger.error('[eventsub/alerts] %s injoignable', sub.type, err);
      results.push({
        ...sub,
        subscribed: false,
        missingScope: false,
        error: 'Twitch EventSub injoignable.',
      });
    }
  }

  const missingScopes = [
    ...new Set(results.filter((r) => r.missingScope).map((r) => r.scope)),
  ].filter(Boolean);

  return {
    result: { callback, subscriptions: results, missingScopes },
    // Journalisé SANS le secret : un journal se relit.
    audit: {
      entity_type: 'twitch_eventsub',
      entity_id: null,
      payload: {
        action: 'subscribe_alerts',
        created: results.filter((r) => r.subscribed).map((r) => r.type),
        missing_scopes: missingScopes,
      },
    },
  };
}

export async function unsubscribeAlerts(
  ctx: ServiceContext
): Promise<{ ok: true; removed: number }> {
  const { creds, appToken, existing } = await alertsContext(ctx);
  if (existing === null) {
    throw fail(502, 'Liste des abonnements illisible.', 'TWITCH_HELIX_ERROR');
  }
  let removed = 0;
  for (const sub of existing) {
    if (!sub.id) continue;
    try {
      if (await helixDelete(sub.id, creds.id, appToken)) removed += 1;
    } catch {
      // Un échec de suppression n'est pas bloquant : l'appel se rejoue.
    }
  }
  return { ok: true, removed };
}

/* ===========================================================================
 * Drop TCG — /twitch/eventsub/tcg-drop
 * ======================================================================== */

/** Le type écouté par `pages/api/webhooks/twitch/tcg-drop.ts`. */
const TCG_SUBSCRIPTION_TYPE =
  'channel.channel_points_custom_reward_redemption.add';
const TCG_SUBSCRIPTION_VERSION = '1';
const TCG_REQUIRED_SCOPE = 'channel:read:redemptions';

const tcgCallbackUrl = () => absoluteSiteUrl('/api/webhooks/twitch/tcg-drop');

type TcgContext = {
  clientId: string;
  secret: string | undefined;
  token: ValidBroadcasterToken;
  appToken: string;
};

async function tcgContext(ctx: ServiceContext): Promise<TcgContext> {
  const secret = process.env.TWITCH_EVENTSUB_SECRET?.trim();
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  if (!clientId) {
    throw fail(503, 'Twitch non configuré.', 'TWITCH_NOT_CONFIGURED');
  }
  const token = await getValidBroadcasterToken(legacyDb(ctx), ctx.tenantId);
  if (!token) {
    throw fail(409, 'Aucune chaîne Twitch connectée.', 'NOT_CONNECTED');
  }
  const appToken = await getAccessToken();
  if (!appToken) {
    throw fail(
      502,
      'Jeton applicatif Twitch indisponible.',
      'TWITCH_TOKEN_ERROR'
    );
  }
  return { clientId, secret, token, appToken };
}

/** Nos abonnements webhook de ce type, quel que soit leur état. */
async function listTcgSubscriptions(
  ctx: ServiceContext,
  appToken: string,
  clientId: string
): Promise<HelixSub[] | null> {
  try {
    const all = await helixList(
      `${HELIX_EVENTSUB}?type=${encodeURIComponent(TCG_SUBSCRIPTION_TYPE)}`,
      clientId,
      appToken,
      true
    );
    if (all === null) {
      ctx.logger.error('[eventsub/tcg-drop] list non-OK');
      return null;
    }
    const ours = tcgCallbackUrl();
    return all.filter(
      (s) => s.transport?.method === 'webhook' && s.transport?.callback === ours
    );
  } catch (err) {
    ctx.logger.error('[eventsub/tcg-drop] list error', err);
    return null;
  }
}

const subscriptionView = (subs: HelixSub[] | null) =>
  subs?.map((s) => ({
    id: s.id ?? null,
    status: s.status ?? null,
    rewardId: s.condition?.reward_id ?? null,
  })) ?? null;

const textOrNull = (v: unknown) =>
  typeof v === 'string' && v.length > 0 ? v : null;

export async function getTcgDropState(ctx: ServiceContext) {
  const { clientId, secret, token, appToken } = await tcgContext(ctx);
  const subs = await listTcgSubscriptions(ctx, appToken, clientId);
  const [row, candidates] = await Promise.all([
    findTcgRewardIds(ctx.db, ctx.tenantId),
    listFeaturedCandidates(ctx.db, ctx.tenantId),
  ]);
  return {
    rewardId: textOrNull(row?.tcg_reward_id),
    featuredRewardId: textOrNull(row?.tcg_featured_reward_id),
    featuredFanartId: textOrNull(row?.tcg_featured_fanart_id),
    featuredCandidates: candidates.map((r) => ({ id: r.id, title: r.title })),
    callbackUrl: tcgCallbackUrl(),
    secretConfigured: Boolean(secret),
    hasScope: hasScope(token.scope, TCG_REQUIRED_SCOPE),
    subscriptions: subscriptionView(subs),
  };
}

export async function subscribeTcgDrop(ctx: ServiceContext, rawBody: unknown) {
  const { clientId, secret, token, appToken } = await tcgContext(ctx);
  const parsed = TcgDropSubscribeSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw fail(400, 'Identifiant de récompense manquant.', 'INVALID_BODY', {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { rewardId, featuredFanartId } = parsed.data;
  if (!secret) {
    throw fail(
      503,
      'TWITCH_EVENTSUB_SECRET absent : le récepteur ne pourrait vérifier aucune signature.',
      'WEBHOOK_SECRET_MISSING'
    );
  }
  const callback = tcgCallbackUrl();
  if (!callback.startsWith('https://')) {
    throw fail(
      400,
      `Twitch exige une URL de rappel publique en HTTPS (reçu : ${callback}). Impossible depuis un poste local.`,
      'CALLBACK_NOT_PUBLIC'
    );
  }
  if (!hasScope(token.scope, TCG_REQUIRED_SCOPE)) {
    throw fail(
      403,
      `Scope manquant : ${TCG_REQUIRED_SCOPE}. Reconnecte la chaîne.`,
      'MISSING_SCOPE',
      { missing: [TCG_REQUIRED_SCOPE] }
    );
  }

  // La récompense d'abord : si l'abonnement échoue, la désignation reste et
  // l'appel se rejoue sans rien ressaisir.
  const { error: saveErr } = await saveTcgReward(
    ctx.db,
    ctx.tenantId,
    rewardId,
    featuredFanartId
  );
  if (saveErr) {
    ctx.logger.error('[eventsub/tcg-drop] récompense non enregistrée', saveErr);
    throw fail(500, 'Enregistrement impossible.');
  }

  let upstreamStatus = 0;
  let refused: { status: number; message: string } | null = null;
  try {
    const upstream = await helixCreate(clientId, appToken, {
      type: TCG_SUBSCRIPTION_TYPE,
      version: TCG_SUBSCRIPTION_VERSION,
      condition: {
        broadcaster_user_id: token.broadcasterId,
        // Limite les notifications à CETTE récompense.
        reward_id: rewardId,
      },
      transport: { method: 'webhook', callback, secret },
    });
    upstreamStatus = upstream.status;
    const json = await readJson<{ message?: string; error?: string }>(upstream);
    const upstreamMessage = json?.message || json?.error || '';
    // 409 = abonnement déjà présent : l'appel est idempotent.
    if (!upstream.ok && upstream.status !== 409) {
      ctx.logger.error(
        '[eventsub/tcg-drop] création refusée %s %s',
        upstream.status,
        upstreamMessage
      );
      refused = { status: upstream.status, message: upstreamMessage };
    }
  } catch (err) {
    ctx.logger.error('[eventsub/tcg-drop] création injoignable', err);
    throw fail(502, 'Twitch EventSub injoignable.', 'TWITCH_HELIX_ERROR', {
      rewardId,
    });
  }
  if (refused) {
    throw fail(
      502,
      `Twitch a refusé l'abonnement (${refused.status}). ${refused.message}`,
      'TWITCH_HELIX_ERROR',
      { rewardId }
    );
  }

  const subs = await listTcgSubscriptions(ctx, appToken, clientId);
  return {
    result: {
      rewardId,
      callbackUrl: callback,
      alreadyExisted: upstreamStatus === 409,
      subscriptions: subscriptionView(subs),
    },
    // Journalisé SANS le secret : un journal se relit.
    audit: {
      entity_type: 'twitch_eventsub',
      entity_id: null,
      payload: {
        action: 'subscribe_tcg_drop',
        reward_id: rewardId,
        featured_fanart_id: featuredFanartId ?? null,
        already_existed: upstreamStatus === 409,
      },
    },
  };
}

export async function unsubscribeTcgDrop(ctx: ServiceContext) {
  const { clientId, appToken } = await tcgContext(ctx);
  const subs = await listTcgSubscriptions(ctx, appToken, clientId);
  if (subs === null) {
    throw fail(502, 'Twitch EventSub injoignable.', 'TWITCH_HELIX_ERROR');
  }
  let removed = 0;
  for (const sub of subs) {
    if (!sub.id) continue;
    try {
      if (await helixDelete(sub.id, clientId, appToken)) removed += 1;
    } catch (err) {
      ctx.logger.error('[eventsub/tcg-drop] suppression échouée', sub.id, err);
    }
  }
  // La récompense désignée reste : la ressaisir serait une corvée inutile.
  return {
    result: { removed },
    audit: {
      entity_type: 'twitch_eventsub',
      entity_id: null,
      payload: { action: 'unsubscribe_tcg_drop', removed },
    },
  };
}
