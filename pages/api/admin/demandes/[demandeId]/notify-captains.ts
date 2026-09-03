// pages/api/admin/demandes/[demandeId]/notify-captains.ts
//
// POST — (re)lancer les capitaines d'une demande de scrim depuis
// /admin/demandes?type=scrim.
//
// POURQUOI UNE RELANCE MANUELLE. Les DM partent tout seuls à la création de la
// demande. Mais une équipe peut n'avoir eu personne de lié à Discord ce jour-là,
// un DM peut être refusé (DM fermés, aucun serveur en commun), ou la demande
// peut simplement dormir. Le salon d'actions du bot dit LEQUEL de ces cas s'est
// produit ; ce bouton donne le geste qui répond au diagnostic.
//
// C'est la MÊME mécanique que l'envoi automatique (`notifyScrimRequestDm`) :
// mêmes destinataires — capitaine, manager, coach —, mêmes boutons dans le DM,
// même trace `scrim.request.dispatched` dans le salon d'actions. Rien de
// parallèle à maintenir.
//
// L'email n'est PAS renvoyé : relancer sur Discord est un geste ciblé, alors
// qu'un second email à la même adresse ressemble à du spam.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import {
  formatScrimDateFr,
  notifyScrimRequestDm,
} from '@/utils/scrimRequestNotify';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'notify-captains'))
    return;
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service base de données indisponible.' });
  }

  const demandeId = req.query.demandeId;
  if (typeof demandeId !== 'string' || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'demandeId invalide.' });
  }

  const { data: demande } = await supabaseAdmin
    .from('demandes')
    .select('id, team_id, status, type, payload')
    .eq('id', demandeId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!demande) {
    return res.status(404).json({ error: 'Demande introuvable.' });
  }
  if (demande.type !== 'scrim') {
    return res
      .status(400)
      .json({ error: 'Seules les demandes de scrim déclenchent des DM.' });
  }
  // Relancer sur une demande déjà tranchée enverrait des boutons qui ne
  // peuvent plus rien faire.
  if (demande.status !== 'pending') {
    return res.status(400).json({
      error: 'Cette demande est déjà traitée : il n’y a plus rien à relancer.',
    });
  }

  const payload = (demande.payload as Record<string, unknown>) || {};
  const nego = readScrimNego(payload);
  const targetTeamId = (demande.team_id as string | null) ?? null;
  if (!targetTeamId) {
    return res
      .status(400)
      .json({ error: 'Cette demande ne vise aucune équipe.' });
  }

  await notifyScrimRequestDm({
    tenantId: ctx.tenantId,
    targetTeamId,
    demandeId,
    slots: nego.slots,
    opponentName: (payload.from_team_name as string) || 'Une équipe',
    dateLabel: formatScrimDateFr(nego.slots),
    message: null,
    requesterName: (payload.requester_name as string) || null,
    isExternal: (payload.requester_email as string | undefined) != null,
  });

  if (ctx.staff?.id) {
    void logStaffAction({
      staff_id: ctx.staff.id,
      action: 'notify_scrim_captains',
      entity_type: 'demande',
      entity_id: demandeId,
      tenant_id: ctx.tenantId,
    }).catch((e) => logger.error('[notify-captains] staff log error: %s', e));
  }

  // Le nombre de DM réellement partis n'est pas connu ici : l'envoi passe par
  // l'outbox du bot. Le salon d'actions dira qui a été joint — c'est là qu'il
  // faut regarder, et le message le dit plutôt que de laisser croire à un
  // succès dont on n'a pas la preuve.
  return res.status(202).json({
    success: true,
    message:
      'Relance envoyée. Le salon d’actions du bot indiquera qui a été joint.',
  });
}

// `manage_teams` et non `manage_scrims` : cette dernière est une permission
// d'ÉQUIPE (utils/teamRoles.ts), pas de staff. Relancer les capitaines d'une
// équipe relève de la gestion des équipes.
export default withStaffRoute(handler, { permission: 'manage_teams' });
