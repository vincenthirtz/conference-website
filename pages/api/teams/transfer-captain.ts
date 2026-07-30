// pages/api/teams/transfer-captain.ts
// PATCH : le capitaine transfère son rôle à un autre membre de l'équipe.
//
// Deux acteurs possibles :
//   1. la CAPITAINE en poste → transfert (RPC `transfer_captain`) ;
//   2. un MANAGER d'une équipe SANS capitaine → amorçage du capitanat (RPC
//      `designate_captain`). C'est le pendant de la création d'équipe « en tant
//      que manager » : l'équipe naît sans capitaine puisque la capitaine
//      désignée doit d'abord accepter son invitation.
// Dans les deux cas, la mutation est atomique côté RPC et le roster verrouillé
// par un tournoi en cours bloque l'opération.

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
import { mapTeamRpcError } from '@/utils/teams/rpcErrors';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import {
  loadTeamRolesFromSupabase,
  roleHasPermission,
} from '@/utils/teamRoles';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';

import { logger } from '../../../utils/logger';

/**
 * Amorçage du capitanat par un manager (équipe sans capitaine). Séparé du
 * transfert classique : pas d'ancien capitaine, donc un seul event role-sync
 * (`role: 'new'`) et un log d'audit distinct.
 */
async function designateCaptain({
  res,
  tenantId,
  teamId,
  actorUserId,
  newCaptainUserId,
}: {
  res: NextApiResponse;
  tenantId: string;
  teamId: string;
  actorUserId: string;
  newCaptainUserId: string;
}) {
  const lockStatus = await isTeamRosterLocked(tenantId, teamId);
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  const { error: rpcErr } = await supabaseAdmin.rpc('designate_captain', {
    p_team_id: teamId,
    p_new_captain: newCaptainUserId,
    p_tenant: tenantId,
  });

  if (rpcErr) {
    const mapped = mapTeamRpcError(rpcErr);
    if (mapped.status >= 500) {
      logger.error('[transfer-captain] designate_captain rpc error:', rpcErr);
    }
    return res.status(mapped.status).json({ error: mapped.error });
  }

  // Pas d'ancien capitaine à désynchroniser : un seul event, pour la nouvelle.
  void emitRoleSyncEvent('team.captain.changed', newCaptainUserId, tenantId, {
    extras: { teamId, role: 'new' },
  }).catch(logger.error);

  const staff = await getStaffByUserId(actorUserId);
  if (staff?.id) {
    await logStaffAction({
      staff_id: staff.id,
      action: 'assign_team_captain',
      entity_type: 'team',
      entity_id: teamId,
      tenant_id: tenantId,
      payload: {
        previous_captain_id: null,
        new_captain_id: newCaptainUserId,
        designated_by: 'manager',
      },
    });
  }

  return res.status(200).json({
    success: true,
    info: 'Capitaine désignée avec succès.',
    newCaptainUserId,
  });
}
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
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });
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

  // Repli MANAGER : une équipe créée par un manager naît SANS capitaine
  // (`captain_id IS NULL` — la capitaine désignée doit d'abord accepter son
  // invitation). Le manager, qui a la permission `manage_roster`, doit pouvoir
  // amorcer le capitanat. On ne l'autorise QUE sur une équipe sans capitaine :
  // voler un capitanat existant reste réservé à la capitaine (et aux routes
  // admin). L'invariant est re-vérifié atomiquement par la RPC
  // `designate_captain` (captain_already_set → 409).
  let bootstrapTeamId: string | null = null;
  if (!team) {
    const access = await getManagedTeam(userId, tenantId);
    if (access?.isManager) {
      const roles = await loadTeamRolesFromSupabase(supabaseAdmin);
      const { data: managedTeamRow } = await supabaseAdmin
        .from('teams')
        .select('id, captain_id')
        .eq('id', access.teamId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      const { data: membership } = await supabaseAdmin
        .from('team_members')
        .select('role')
        .eq('team_id', access.teamId)
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .maybeSingle();

      if (
        managedTeamRow &&
        !managedTeamRow.captain_id &&
        roleHasPermission(roles, membership?.role, 'manage_roster')
      ) {
        bootstrapTeamId = managedTeamRow.id as string;
      }
    }
  }

  if (bootstrapTeamId) {
    return await designateCaptain({
      res,
      tenantId,
      teamId: bootstrapTeamId,
      actorUserId: userId,
      newCaptainUserId,
    });
  }

  if (!team) {
    return res
      .status(403)
      .json({ error: "Tu n'es capitaine d'aucune équipe." });
  }

  // Bloquer si le roster est verrouillé par un tournoi en cours :
  // changer de capitaine pendant un tournoi modifie qui peut agir
  // sur les line-ups, scrims, scores… c'est une rupture d'intégrité métier.
  // Un admin peut toujours forcer via les routes /api/admin/*.
  const lockStatus = await isTeamRosterLocked(tenantId, team.id);
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  // Transfert atomique via la RPC transactionnelle `transfer_captain` :
  // verrou FOR UPDATE sur teams + EXISTS(membre non-coach) + UPDATE captain_id,
  // le tout dans une seule transaction — pas de fenêtre TOCTOU ni de pré-check
  // applicatif à maintenir. Les erreurs métier (team_not_found, not_captain,
  // same_user, target_not_member) sont levées comme exceptions PL/pgSQL et
  // mappées vers HTTP via mapTeamRpcError.
  const { error: rpcErr } = await supabaseAdmin.rpc('transfer_captain', {
    p_team_id: team.id,
    p_new_captain: newCaptainUserId,
    p_tenant: tenantId,
    p_actor: userId,
  });

  if (rpcErr) {
    const mapped = mapTeamRpcError(rpcErr);
    if (mapped.status >= 500) {
      logger.error('[transfer-captain] transfer_captain rpc error:', rpcErr);
    }
    return res.status(mapped.status).json({ error: mapped.error });
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
