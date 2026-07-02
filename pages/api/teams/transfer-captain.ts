// pages/api/teams/transfer-captain.ts
// PATCH : le capitaine transfère son rôle à un autre membre de l'équipe

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withAuthRoute, getStaffByUserId } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'teams-transfer-captain'
    )
  )
    return;

  const userId = user.id;
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });
  const { newCaptainUserId } = req.body || {};

  if (
    !newCaptainUserId ||
    typeof newCaptainUserId !== 'string' ||
    !isValidUUID(newCaptainUserId)
  ) {
    return res.status(400).json({ error: 'newCaptainUserId (UUID) requis.' });
  }

  if (newCaptainUserId === userId) {
    return res.status(400).json({ error: 'Tu es déjà capitaine.' });
  }

  // Trouver l'équipe dont l'utilisateur est capitaine
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('captain_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (teamErr) {
    logger.error('[transfer-captain] team lookup error:', teamErr);
    return res.status(500).json({ error: 'Failed to find your team.' });
  }

  if (!team) {
    return res
      .status(403)
      .json({ error: "Tu n'es capitaine d'aucune équipe." });
  }

  // Vérifier que le nouveau capitaine est bien membre de l'équipe ET n'est pas
  // coach : le capitanat implique de piloter la line-up, ce qui n'a pas de sens
  // pour un coach (exclu du roster joueur). On exclut donc explicitement le
  // rôle coach du capitanat.
  const { data: newCaptainMembership } = await supabaseAdmin
    .from('team_members')
    .select('id, role')
    .eq('team_id', team.id)
    .eq('user_id', newCaptainUserId)
    .eq('tenant_id', tenantId)
    .neq('role', 'coach')
    .maybeSingle();

  if (!newCaptainMembership) {
    return res.status(400).json({
      error: "Ce joueur n'est pas un membre valide de ton équipe (ou est coach).",
    });
  }

  // Bloquer si le roster est verrouillé par un tournoi en cours :
  // changer de capitaine pendant un tournoi modifie qui peut agir
  // sur les line-ups, scrims, scores… c'est une rupture d'intégrité métier.
  // Un admin peut toujours forcer via les routes /api/admin/*.
  const lockStatus = await isTeamRosterLocked(tenantId, team.id);
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  // Transfert atomique et sûr : UPDATE conditionné par (id, tenant_id) ET
  // captain_id === l'appelant (CAS — le demandeur est toujours le capitaine au
  // moment de l'écriture, pas de fenêtre TOCTOU depuis le lookup ci-dessus).
  // `.select()` renvoie les lignes affectées : 0 ligne ⇒ un autre transfert a
  // eu lieu entre-temps ⇒ 409.
  const { data: updatedRows, error: updateErr } = await supabaseAdmin
    .from('teams')
    .update({
      captain_id: newCaptainUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', team.id)
    .eq('tenant_id', tenantId)
    .eq('captain_id', userId)
    .select('id');

  if (updateErr) {
    logger.error('[transfer-captain] update error:', updateErr);
    return res.status(500).json({ error: 'Failed to transfer captaincy.' });
  }

  if (!updatedRows || updatedRows.length === 0) {
    return res.status(409).json({
      error: 'Le capitanat a déjà été transféré. Recharge la page.',
    });
  }

  // Bot role-sync + web-push : ce handler fait son propre UPDATE (il n'appelle
  // pas setTeamCaptain), donc rien n'est émis sans ça. On miroite EXACTEMENT la
  // forme d'event de setTeamCaptain (utils/teams/addMember.ts) : deux events
  // `team.captain.changed`, un pour l'ancien capitaine (`role: 'previous'`, il
  // perd le rôle) et un pour le nouveau (`role: 'new'`, il le gagne). Le bot
  // fait 1 sync par event — idempotent. Fire-and-forget : un échec d'émission
  // ne doit pas faire échouer le transfert déjà persisté.
  void emitRoleSyncEvent('team.captain.changed', userId, tenantId, {
    extras: { teamId: team.id, role: 'previous' },
  }).catch(logger.error);
  void emitRoleSyncEvent('team.captain.changed', newCaptainUserId, tenantId, {
    extras: { teamId: team.id, role: 'new' },
  }).catch(logger.error);

  // Audit : designation d'un nouveau capitaine.
  const staff = await getStaffByUserId(userId);
  if (staff?.id) {
    await logStaffAction({
      staff_id: staff.id,
      action: 'assign_team_captain',
      entity_type: 'team',
      entity_id: team.id,
      tenant_id: tenantId,
      payload: {
        previous_captain_id: userId,
        new_captain_id: newCaptainUserId,
      },
    });
  }

  return res.status(200).json({
    success: true,
    info: 'Capitanat transféré avec succès.',
    newCaptainUserId,
  });
});
