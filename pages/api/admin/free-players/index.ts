// pages/api/admin/free-players/index.ts
//
// Vue staff du marché des joueuses libres (lot 1 acquisition).
//
//   GET    — liste les fiches du tenant, les deux provenances confondues.
//   DELETE — retire une fiche (`?id=`).
//
// POURQUOI un DELETE côté staff alors que la joueuse a déjà son lien de retrait
// par email : elle peut avoir perdu l'email, changé d'adresse, ou demander le
// retrait par un autre canal (Discord, formulaire de contact). Une donnée
// publiée doit avoir DEUX portes de sortie — celle de la personne concernée, et
// celle de l'opérateur qu'elle sollicite.
//
// Les fiches Discord (`source='discord'`) sont supprimables ici aussi, mais le
// retrait n'est pas durable : le bot les repousse à la synchro suivante tant que
// la joueuse porte le rôle. La réponse le signale (`willReturn`) pour que l'UI
// puisse le dire au staff plutôt que de le laisser découvrir 30 minutes plus tard.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import {
  FREE_PLAYER_SELECT,
  normalizeRoles,
  type FreePlayerRow,
} from '@/utils/freePlayers';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-free-players')
  ) {
    return;
  }
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: ctx?.user?.id,
  });

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('free_players')
      .select(FREE_PLAYER_SELECT)
      .eq('tenant_id', tenantId)
      .order('marked_at', { ascending: false });
    if (error) {
      logger.error('[admin/free-players] list error', error);
      return res.status(500).json({ error: 'Chargement impossible.' });
    }

    // Le staff VOIT les coordonnées : c'est ce qui lui permet de traiter une
    // demande de retrait reçue par un autre canal (« c'est moi, telle adresse »).
    const items = ((data ?? []) as FreePlayerRow[]).map((r) => ({
      id: r.id,
      source: r.source === 'web' ? 'web' : 'discord',
      name: r.display_name ?? r.discord_username ?? null,
      roles: normalizeRoles(r.roles),
      level: r.level ?? null,
      availability: r.availability ?? null,
      note: r.note ?? null,
      contactEmail: r.contact_email ?? null,
      contactDiscord: r.contact_discord ?? null,
      discordUsername: r.discord_username ?? null,
      markedAt: r.marked_at,
      expiresAt: r.expires_at,
    }));

    return res.status(200).json({ items });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id manquant.' });

    // Lecture avant suppression : on a besoin de la provenance pour prévenir le
    // staff d'un retour possible, et du nom pour le journal.
    const { data: existing } = await supabaseAdmin
      .from('free_players')
      .select('id, source, display_name, discord_username')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const row = existing as {
      id: string;
      source: string | null;
      display_name: string | null;
      discord_username: string | null;
    } | null;
    if (!row) return res.status(404).json({ error: 'Fiche introuvable.' });

    const { error } = await supabaseAdmin
      .from('free_players')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) {
      logger.error('[admin/free-players] delete error', error);
      return res.status(500).json({ error: 'Suppression impossible.' });
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'delete_free_player',
          entity_type: 'free_player',
          entity_id: id,
          tenant_id: tenantId,
          payload: {
            source: row.source,
            name: row.display_name ?? row.discord_username ?? null,
          },
        });
      } catch (logErr) {
        logger.error('logStaffAction(delete_free_player) error:', logErr);
      }
    }

    return res.status(200).json({
      success: true,
      // Vrai = le bot la repoussera tant que le rôle Discord est porté.
      willReturn: row.source === 'discord',
    });
  }

  res.setHeader('Allow', 'GET,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
