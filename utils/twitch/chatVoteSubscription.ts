// utils/twitch/chatVoteSubscription.ts — l'abonnement EventSub au chat Twitch
// qui compte les « !mvp » côté serveur (pages/api/webhooks/twitch/chat-mvp.ts).
//
// SEULEMENT PENDANT UN VOTE. `channel.chat.message` livre CHAQUE message du
// chat : abonné en permanence, chaque ligne d'un chat animé réveillerait une
// fonction serveur, des milliers de fois par heure de direct, pour rien. On
// s'abonne donc à l'OUVERTURE d'un vote du public et on se désabonne à sa
// CLÔTURE ; un message reçu sans vote ouvert désabonne aussi (filet si la
// clôture n'a pas eu lieu, fenêtre échue).
//
// CONDITION : `broadcaster_user_id` ET `user_id` = la chaîne connectée. Twitch
// exige, pour un transport webhook (jeton d'APPLICATION), que l'utilisateur
// lecteur ait accordé `user:read:chat` + `user:bot`, et la chaîne `channel:bot`
// — ici la même personne. Une connexion antérieure à ces scopes doit être
// refaite (Admin › Twitch › reconnecter la chaîne).
//
// BEST-EFFORT : un échec ici ne doit jamais empêcher d'ouvrir ou de clore un
// vote (Discord et le cockpit continuent de voter). On rend un diagnostic.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { clientCreds, getAccessToken } from '@/utils/twitch';
import { getValidBroadcasterToken, hasScope } from '@/utils/twitchBroadcaster';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { EVENTSUB_SECRET_ENV } from '@/utils/twitch/eventsubRequest';

const HELIX_EVENTSUB = 'https://api.twitch.tv/helix/eventsub/subscriptions';
export const CHAT_VOTE_EVENT = 'channel.chat.message';
export const CHAT_VOTE_SCOPES = [
  'user:read:chat',
  'user:bot',
  'channel:bot',
] as const;

export const chatVoteCallbackUrl = () =>
  absoluteSiteUrl('/api/webhooks/twitch/chat-mvp');

export type ChatVoteStatus =
  | 'subscribed'
  | 'not_configured'
  | 'not_connected'
  | 'missing_scope'
  | 'error';

/** Ce qui manque pour que le chat Twitch vote tout seul, sans rien appeler. */
export async function chatVoteReadiness(tenantId: string): Promise<{
  status: Exclude<ChatVoteStatus, 'subscribed' | 'error'> | 'ready';
  missingScopes: string[];
}> {
  if (!clientCreds() || !process.env[EVENTSUB_SECRET_ENV]) {
    return { status: 'not_configured', missingScopes: [] };
  }
  const token = await getValidBroadcasterToken(
    supabaseAdmin as never,
    tenantId
  );
  if (!token) return { status: 'not_connected', missingScopes: [] };
  const missing = CHAT_VOTE_SCOPES.filter((s) => !hasScope(token.scope, s));
  return missing.length > 0
    ? { status: 'missing_scope', missingScopes: [...missing] }
    : { status: 'ready', missingScopes: [] };
}

/** S'abonne au chat de la chaîne de l'espace. Idempotent (409 = déjà fait). */
export async function ensureChatVoteSubscription(
  tenantId: string
): Promise<ChatVoteStatus> {
  try {
    const creds = clientCreds();
    const secret = process.env[EVENTSUB_SECRET_ENV];
    const callback = chatVoteCallbackUrl();
    if (!creds || !secret || !callback.startsWith('https://')) {
      return 'not_configured';
    }
    const token = await getValidBroadcasterToken(
      supabaseAdmin as never,
      tenantId
    );
    if (!token) return 'not_connected';
    if (CHAT_VOTE_SCOPES.some((s) => !hasScope(token.scope, s))) {
      return 'missing_scope';
    }
    const appToken = await getAccessToken();
    if (!appToken) return 'error';

    const res = await fetch(HELIX_EVENTSUB, {
      method: 'POST',
      headers: {
        'Client-ID': creds.id,
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: CHAT_VOTE_EVENT,
        version: '1',
        condition: {
          broadcaster_user_id: token.broadcasterId,
          user_id: token.broadcasterId,
        },
        transport: { method: 'webhook', callback, secret },
      }),
    });
    if (res.ok || res.status === 409) return 'subscribed';
    logger.error('[twitch/chat-vote] abonnement refusé: HTTP %s', res.status);
    return 'error';
  } catch (err) {
    logger.error('[twitch/chat-vote] abonnement impossible', err);
    return 'error';
  }
}

/**
 * Supprime les abonnements au chat de la chaîne `broadcasterId` (ou de celle
 * de l'espace) qui pointent vers NOTRE récepteur. Best-effort, silencieux.
 */
export async function removeChatVoteSubscription(opts: {
  tenantId?: string;
  broadcasterId?: string;
}): Promise<number> {
  try {
    const creds = clientCreds();
    if (!creds) return 0;
    let broadcasterId = opts.broadcasterId ?? null;
    if (!broadcasterId && opts.tenantId) {
      const token = await getValidBroadcasterToken(
        supabaseAdmin as never,
        opts.tenantId
      );
      broadcasterId = token?.broadcasterId ?? null;
    }
    if (!broadcasterId) return 0;
    const appToken = await getAccessToken();
    if (!appToken) return 0;
    const headers = {
      'Client-ID': creds.id,
      Authorization: `Bearer ${appToken}`,
    };
    const list = await fetch(
      `${HELIX_EVENTSUB}?type=${encodeURIComponent(CHAT_VOTE_EVENT)}`,
      { headers }
    );
    if (!list.ok) return 0;
    const json = (await list.json()) as {
      data?: {
        id: string;
        condition?: { broadcaster_user_id?: string };
        transport?: { callback?: string };
      }[];
    };
    const callback = chatVoteCallbackUrl();
    const mine = (json.data ?? []).filter(
      (s) =>
        s.condition?.broadcaster_user_id === broadcasterId &&
        s.transport?.callback === callback
    );
    for (const s of mine) {
      await fetch(`${HELIX_EVENTSUB}?id=${encodeURIComponent(s.id)}`, {
        method: 'DELETE',
        headers,
      });
    }
    return mine.length;
  } catch (err) {
    logger.error('[twitch/chat-vote] désabonnement impossible', err);
    return 0;
  }
}
