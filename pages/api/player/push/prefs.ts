// pages/api/player/push/prefs.ts
//
// GET  /api/player/push/prefs
// PUT  /api/player/push/prefs
//
// Préférences Web Push pour le user player courant. Symétrique de
// /api/admin/notifications/prefs mais expose UNIQUEMENT le sous-ensemble
// `PLAYER_PUSH_EVENT_TYPES` (match, scrim, check-in, news, forfait) — pas
// les events staff-only que la joueuse ne reçoit jamais.
//
// Modèle "row absente = enabled" (cf. admin prefs). Le dispatcher consulte
// la même table `notification_prefs` pour décider d'envoyer ou non.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';
import { PLAYER_PUSH_EVENT_TYPES } from '@/utils/webPushEvents';

const prefsPutSchema = z.object({
  prefs: z
    .array(
      z.object({
        event_type: z.enum(PLAYER_PUSH_EVENT_TYPES),
        enabled: z.boolean(),
      })
    )
    .max(PLAYER_PUSH_EVENT_TYPES.length * 2),
});

type PrefRow = { event_type: string; enabled: boolean };

function mergeWithDefaults(rows: PrefRow[]): PrefRow[] {
  const map = new Map<string, boolean>();
  for (const r of rows) map.set(r.event_type, r.enabled);
  return PLAYER_PUSH_EVENT_TYPES.map((event_type) => ({
    event_type,
    enabled: map.has(event_type) ? (map.get(event_type) as boolean) : true,
  }));
}

async function loadPrefs(authUserId: string): Promise<PrefRow[]> {
  const { data, error } = await supabaseAdmin!
    .from('notification_prefs')
    .select('event_type, enabled')
    .eq('user_id', authUserId)
    .in('event_type', PLAYER_PUSH_EVENT_TYPES as unknown as string[]);

  if (error) {
    logger.error('[player/push/prefs] load error', error);
    throw new Error('Failed to load prefs');
  }
  return (data ?? []) as PrefRow[];
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
      return res.status(200).json({ prefs: mergeWithDefaults(rows) });
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

    const finalState = new Map<string, boolean>();
    for (const p of parsed.data.prefs) finalState.set(p.event_type, p.enabled);

    const toUpsert: Array<{
      user_id: string;
      event_type: string;
      enabled: boolean;
      updated_at: string;
    }> = [];
    const nowIso = new Date().toISOString();
    for (const [event_type, enabled] of finalState) {
      if (!enabled) {
        toUpsert.push({
          user_id: authUserId,
          event_type,
          enabled: false,
          updated_at: nowIso,
        });
      }
    }

    // 1) DELETE des rows visées (qu'on va ré-insérer pour les opt-out, et
    //    purement supprimer pour les re-enable). Scope au user courant.
    const allTargetedTypes = Array.from(finalState.keys());
    if (allTargetedTypes.length > 0) {
      const { error: deleteError } = await supabaseAdmin!
        .from('notification_prefs')
        .delete()
        .eq('user_id', authUserId)
        .in('event_type', allTargetedTypes);
      if (deleteError) {
        logger.error('[player/push/prefs] PUT delete error', deleteError);
        return res.status(500).json({ error: 'Erreur serveur.' });
      }
    }

    if (toUpsert.length > 0) {
      const { error: insertError } = await supabaseAdmin!
        .from('notification_prefs')
        .insert(toUpsert);
      if (insertError) {
        logger.error('[player/push/prefs] PUT insert error', insertError);
        return res.status(500).json({ error: 'Erreur serveur.' });
      }
    }

    try {
      const rows = await loadPrefs(authUserId);
      return res.status(200).json({ prefs: mergeWithDefaults(rows) });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  }

  res.setHeader('Allow', 'GET,PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuthRoute(handler);
