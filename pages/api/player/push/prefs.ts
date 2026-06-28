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

function buildResponse(rows: PrefRow[]) {
  return {
    push: mergeChannel(rows, 'push'),
    email: mergeChannel(rows, 'email'),
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

    // Validation : l'event_type doit appartenir à la whitelist du canal visé.
    if (!CHANNEL_TYPES[channel].includes(eventType)) {
      return res.status(400).json({
        error: `event_type "${eventType}" non autorisé pour le canal "${channel}".`,
        code: 'INVALID_EVENT_TYPE',
      });
    }

    // Une row n'existe que pour un état NON-DÉFAUT. On supprime d'abord la row
    // ciblée (user, event_type, channel), puis on ré-insère uniquement si
    // `enabled` diffère du défaut du canal.
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

    if (enabled !== CHANNEL_DEFAULT[channel]) {
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
