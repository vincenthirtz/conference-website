// pages/api/player/push/prefs.ts
//
// GET  /api/player/push/prefs
// PUT  /api/player/push/prefs
//
// Préférences de notification CHANNEL-AWARE du user player courant. Deux canaux :
//   - push  : sous-ensemble PLAYER_PUSH_EVENT_TYPES, modèle OPT-OUT (absent =
//             true). Le dispatcher Web Push n'écarte que sur un opt-out
//             explicite (notification_prefs channel='push' enabled=false).
//   - email : sous-ensemble EMAIL_EVENT_TYPES, modèle OPT-IN (absent = false).
//             Le digest email n'envoie QUE si une row channel='email'
//             enabled=true existe (cf. utils/notificationAudience).
//
// La table `notification_prefs` est keyée (user_id, event_type, channel).
// Une row n'existe que pour exprimer un état NON-DÉFAUT :
//   - push : on persiste seulement les opt-out (enabled=false).
//   - email : on persiste seulement les opt-in (enabled=true).
// Tout retour au défaut = suppression de la row.
//
// Cas spécial BROADCAST (annonces/campagnes) : le combo
// (event_type='broadcast', channel='email') vit sur le canal email mais suit un
// modèle OPT-OUT (abonné par défaut = true), posé par la désinscription RGPD et
// relu par utils/broadcasts::computeAudienceRecipients. Il est exposé à part via
// le champ top-level `broadcastEmail` du corps GET/PUT, sans toucher les maps
// push/email. Réabonnement (enabled=true) = suppression de la row ; désinscription
// (enabled=false) = insertion de la row.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';
import {
  PLAYER_PUSH_EVENT_TYPES,
  EMAIL_EVENT_TYPES,
  BROADCAST_OPT_OUT_EVENT_TYPE,
} from '@/utils/webPushEvents';

type Channel = 'push' | 'email';

const CHANNEL_TYPES: Record<Channel, readonly string[]> = {
  push: PLAYER_PUSH_EVENT_TYPES,
  email: EMAIL_EVENT_TYPES,
};

// Défaut par canal : push opt-out (absent = true), email opt-in (absent = false).
const CHANNEL_DEFAULT: Record<Channel, boolean> = {
  push: true,
  email: false,
};

/**
 * Le combo BROADCAST est un cas à part : bien que sur le canal 'email', son
 * modèle est OPT-OUT (absent = abonné = true), à l'inverse des EMAIL_EVENT_TYPES
 * qui sont opt-IN. Cette valeur sentinelle hors-catalogue est posée par la
 * désinscription RGPD et relue par computeAudienceRecipients (utils/broadcasts).
 */
function isBroadcastCombo(channel: Channel, eventType: string): boolean {
  return channel === 'email' && eventType === BROADCAST_OPT_OUT_EVENT_TYPE;
}

/**
 * Défaut applicable à un (channel, eventType) donné. Pour le combo broadcast le
 * défaut est OPT-OUT = true (abonné) ; sinon on retombe sur le défaut du canal.
 */
function defaultFor(channel: Channel, eventType: string): boolean {
  if (eventType === BROADCAST_OPT_OUT_EVENT_TYPE) return true;
  return CHANNEL_DEFAULT[channel];
}

/**
 * Un event_type est-il valide pour ce canal ? On accepte la whitelist du canal
 * OU le combo broadcast (email uniquement). Tout autre event_type inconnu reste
 * rejeté (INVALID_EVENT_TYPE).
 */
function isValidCombo(channel: Channel, eventType: string): boolean {
  return (
    CHANNEL_TYPES[channel].includes(eventType) ||
    isBroadcastCombo(channel, eventType)
  );
}

const prefsPutSchema = z.object({
  eventType: z.string().min(1),
  channel: z.enum(['push', 'email']),
  enabled: z.boolean(),
});

type PrefRow = { event_type: string; channel: string; enabled: boolean };

/** Charge toutes les rows notification_prefs du user (tous canaux). */
async function loadPrefs(authUserId: string): Promise<PrefRow[]> {
  const { data, error } = await supabaseAdmin!
    .from('notification_prefs')
    .select('event_type, channel, enabled')
    .eq('user_id', authUserId);

  if (error) {
    logger.error('[player/push/prefs] load error', error);
    throw new Error('Failed to load prefs');
  }
  return (data ?? []) as PrefRow[];
}

/**
 * Construit l'état exhaustif d'un canal : chaque event_type du canal mappé à
 * son `enabled`, en appliquant le défaut du canal quand aucune row n'existe.
 */
function mergeChannel(
  rows: PrefRow[],
  channel: Channel
): Record<string, boolean> {
  const map = new Map<string, boolean>();
  for (const r of rows) {
    if (r.channel === channel) map.set(r.event_type, r.enabled);
  }
  const out: Record<string, boolean> = {};
  for (const eventType of CHANNEL_TYPES[channel]) {
    out[eventType] = map.has(eventType)
      ? (map.get(eventType) as boolean)
      : CHANNEL_DEFAULT[channel];
  }
  return out;
}

/**
 * Abonnement aux emails BROADCAST (annonces / campagnes). Modèle OPT-OUT :
 * abonné par défaut (true), désinscrit uniquement si une row
 * (event_type='broadcast', channel='email', enabled=false) existe.
 */
function computeBroadcastEmail(rows: PrefRow[]): boolean {
  const optedOut = rows.some(
    (r) =>
      r.channel === 'email' &&
      r.event_type === BROADCAST_OPT_OUT_EVENT_TYPE &&
      r.enabled === false
  );
  return !optedOut;
}

function buildResponse(rows: PrefRow[]) {
  return {
    push: mergeChannel(rows, 'push'),
    email: mergeChannel(rows, 'email'),
    broadcastEmail: computeBroadcastEmail(rows),
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-push-prefs')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const authUserId = ctx.user.id;

  if (req.method === 'GET') {
    try {
      const rows = await loadPrefs(authUserId);
      return res.status(200).json(buildResponse(rows));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  }

  if (req.method === 'PUT') {
    const parsed = prefsPutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation échouée.',
        code: 'INVALID_BODY',
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    const { eventType, channel, enabled } = parsed.data;

    // Validation : l'event_type doit appartenir à la whitelist du canal visé,
    // ou être le combo broadcast (email opt-out RGPD).
    if (!isValidCombo(channel, eventType)) {
      return res.status(400).json({
        error: `event_type "${eventType}" non autorisé pour le canal "${channel}".`,
        code: 'INVALID_EVENT_TYPE',
      });
    }

    // Une row n'existe que pour un état NON-DÉFAUT. On supprime d'abord la row
    // ciblée (user, event_type, channel), puis on ré-insère uniquement si
    // `enabled` diffère du défaut. Le défaut dépend de l'event_type (le combo
    // broadcast est opt-OUT = true) et pas seulement du canal.
    const { error: deleteError } = await supabaseAdmin!
      .from('notification_prefs')
      .delete()
      .eq('user_id', authUserId)
      .eq('event_type', eventType)
      .eq('channel', channel);
    if (deleteError) {
      logger.error('[player/push/prefs] PUT delete error', deleteError);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }

    if (enabled !== defaultFor(channel, eventType)) {
      const { error: insertError } = await supabaseAdmin!
        .from('notification_prefs')
        .insert({
          user_id: authUserId,
          event_type: eventType,
          channel,
          enabled,
          updated_at: new Date().toISOString(),
        });
      if (insertError) {
        logger.error('[player/push/prefs] PUT insert error', insertError);
        return res.status(500).json({ error: 'Erreur serveur.' });
      }
    }

    try {
      const rows = await loadPrefs(authUserId);
      return res.status(200).json(buildResponse(rows));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  }

  res.setHeader('Allow', 'GET,PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuthRoute(handler);
