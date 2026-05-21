// pages/api/admin/notifications/prefs.ts
//
// GET  /api/admin/notifications/prefs
// PUT  /api/admin/notifications/prefs
//
// Préférences de notification Web Push pour le user staff courant.
//
// Modèle "row absente = enabled = TRUE" (opt-out) :
//   - Le GET retourne TOUJOURS la liste exhaustive des event_types supportés
//     (cf. utils/webPushEvents.ts), en fusionnant avec les rows présentes
//     dans `notification_prefs` pour le user courant.
//   - Le PUT n'écrit que les opt-out explicites : pour chaque pref reçue,
//     si `enabled = false` → upsert (row "désactivée") ; si `enabled = true`
//     → DELETE de la row (le défaut implicite est déjà "true", autant ne pas
//     polluer la table). Optimisation storage + cohérence avec le dispatcher
//     qui ne query que les rows enabled=false.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';
import { WEB_PUSH_EVENT_TYPES } from '@/utils/webPushEvents';

const prefsPutSchema = z.object({
  prefs: z
    .array(
      z.object({
        event_type: z.enum(WEB_PUSH_EVENT_TYPES),
        enabled: z.boolean(),
      })
    )
    .max(WEB_PUSH_EVENT_TYPES.length * 2), // borne large, permet doublons côté client
});

type PrefRow = { event_type: string; enabled: boolean };

/**
 * Construit la réponse exhaustive : pour CHAQUE event_type connu, indique
 * `enabled` (par défaut true, sinon valeur de la row DB).
 */
function mergeWithDefaults(rows: PrefRow[]): PrefRow[] {
  const map = new Map<string, boolean>();
  for (const r of rows) map.set(r.event_type, r.enabled);
  return WEB_PUSH_EVENT_TYPES.map((event_type) => ({
    event_type,
    enabled: map.has(event_type) ? (map.get(event_type) as boolean) : true,
  }));
}

async function loadPrefs(authUserId: string): Promise<PrefRow[]> {
  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .select('event_type, enabled')
    .eq('user_id', authUserId);

  if (error) {
    logger.error('[admin/notif/prefs] load error', error);
    throw new Error('Failed to load prefs');
  }
  return (data ?? []) as PrefRow[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-notif-prefs')
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

    const { prefs } = parsed.data;

    // Dedupe : si le client envoie plusieurs entries pour le même event_type,
    // la dernière gagne (pattern habituel des form serialisations).
    const finalState = new Map<string, boolean>();
    for (const p of prefs) finalState.set(p.event_type, p.enabled);

    const toDelete: string[] = [];
    const toUpsert: Array<{
      user_id: string;
      event_type: string;
      enabled: boolean;
      updated_at: string;
    }> = [];

    const nowIso = new Date().toISOString();
    for (const [event_type, enabled] of finalState) {
      if (enabled) {
        // Default = true. Une row n'apporte aucune info, on la supprime si
        // elle existait pour garder la table propre.
        toDelete.push(event_type);
      } else {
        toUpsert.push({
          user_id: authUserId,
          event_type,
          enabled: false,
          updated_at: nowIso,
        });
      }
    }

    // 1) DELETE des rows dont l'état final est "enabled = true" (default
    //    implicite), ET aussi des opt-outs qu'on va ré-insérer juste après.
    //    On supprime toujours d'abord puis on insert : c'est plus simple
    //    qu'un upsert avec PK composite et tout aussi atomique côté Postgres
    //    sous le RLS (les deux opérations sont scoped au user courant).
    const allTargetedTypes = [
      ...toDelete,
      ...toUpsert.map((u) => u.event_type),
    ];
    if (allTargetedTypes.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('notification_prefs')
        .delete()
        .eq('user_id', authUserId)
        .in('event_type', allTargetedTypes);

      if (deleteError) {
        logger.error('[admin/notif/prefs] PUT delete error', deleteError);
        return res.status(500).json({ error: 'Erreur serveur.' });
      }
    }

    // 2) INSERT des opt-out (enabled = false). PK composite
    //    (user_id, event_type) : l'unicité est garantie par le DELETE
    //    préalable + le dedupe Map côté code.
    if (toUpsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('notification_prefs')
        .insert(toUpsert);

      if (insertError) {
        logger.error('[admin/notif/prefs] PUT insert error', insertError);
        return res.status(500).json({ error: 'Erreur serveur.' });
      }
    }

    // 3) Renvoie l'état complet (réutilise la query GET) pour éviter un
    //    refetch client.
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

export default withStaffRoute(handler, 'caster');
