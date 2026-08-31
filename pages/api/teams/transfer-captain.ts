// pages/api/teams/transfer-captain.ts
// PATCH : le capitaine transfère son rôle à un autre membre de l'équipe.
//
// Deux acteurs possibles :
//   1. la CAPITAINE en poste → transfert (RPC `transfer_captain`) ;
//   2. un MANAGER de l'équipe (permission `manage_roster`) → attribution du
//      capitanat via la RPC `reassign_captain`, que l'équipe en ait déjà une
//      ou non. Amorçage (équipe créée « en tant que manager », dont la
//      capitaine désignée n'a pas encore accepté) ET réattribution passent par
//      le même chemin : tenir le roster est son métier, et une capitaine
//      inactive bloquait sinon l'équipe entière jusqu'à intervention du staff.
// Dans les deux cas, la mutation est atomique côté RPC et le roster verrouillé
// par un tournoi en cours bloque l'opération.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { getStaffByUserId } from '@/utils/staff';
import { withSubjectRoute } from '@/utils/subject';
import { logStaffAction } from '@/utils/staffLogs';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { mapTeamRpcError } from '@/utils/teams/rpcErrors';
import { accessHasPermission } from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';

import { logger } from '../../../utils/logger';

/**
 * Attribution du capitanat PAR UN MANAGER. Couvre les deux cas d'un seul
 * chemin, parce que du point de vue du manager c'est le même geste : désigner
 * qui porte le brassard.
 *
 * `previousCaptainId` est lu AVANT la mutation : c'est lui qui détermine s'il
 * faut désynchroniser un ancien capitaine côté Discord. Un amorçage n'a pas
 * d'ancien, une réattribution en a un — et lui laisser son rôle Discord ferait
 * deux capitaines visibles sur le serveur pour une équipe qui n'en a qu'une.
 */
async function assignCaptainAsManager({
  res,
  tenantId,
  teamId,
  actorUserId,
  previousCaptainId,
  newCaptainUserId,
}: {
  res: NextApiResponse;
  tenantId: string;
  teamId: string;
  actorUserId: string;
  previousCaptainId: string | null;
  newCaptainUserId: string;
}) {
  const lockStatus = await isTeamRosterLocked(tenantId, teamId);
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  const { error: rpcErr } = await supabaseAdmin.rpc('reassign_captain', {
    p_team_id: teamId,
    p_new_captain: newCaptainUserId,
    p_tenant: tenantId,
  });

  if (rpcErr) {
    const mapped = mapTeamRpcError(rpcErr);
    if (mapped.status >= 500) {
      logger.error('[transfer-captain] reassign_captain rpc error:', rpcErr);
    }
    return res.status(mapped.status).json({ error: mapped.error });
  }

  // Ancien capitaine, s'il y en avait un : il perd le rôle Discord.
  if (previousCaptainId) {
    void emitRoleSyncEvent(
      'team.captain.changed',
      previousCaptainId,
      tenantId,
      { extras: { teamId, role: 'previous' } }
    ).catch(logger.error);
  }
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
        previous_captain_id: previousCaptainId,
        new_captain_id: newCaptainUserId,
        designated_by: 'manager',
      },
    });
  }

  return res.status(200).json({
    success: true,
    info: previousCaptainId
      ? 'Capitanat réattribué avec succès.'
      : 'Capitaine désignée avec succès.',
    newCaptainUserId,
  });
}
export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { subject }
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

    // Sujet = l'appelant, ou la capitaine dépannée en act-as (`?as=…&act=1`) :
    // c'est SON capitanat qui est transféré, jamais celui du staff.
    const { userId, tenantId } = subject;
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

    // Chemin MANAGER : l'appelante n'est capitaine de rien, mais elle GÈRE une
    // équipe (permission `manage_roster`). Elle peut alors désigner la
    // capitaine — que le poste soit vacant (équipe créée « en tant que
    // manager », la capitaine désignée n'ayant pas encore accepté) ou déjà
    // occupé.
    //
    // La réattribution était auparavant réservée à la capitaine en poste. Ça
    // laissait une équipe bloquée dès que sa capitaine décrochait : le manager
    // voyait le bouton, cliquait, et recevait « Tu n'es capitaine d'aucune
    // équipe » — un message qui ne décrivait même pas sa situation. Tenir le
    // roster est précisément son rôle ; l'action est journalisée.
    let managerTeam: { id: string; captainId: string | null } | null = null;
    if (!team) {
      const access = await getManagedTeamForRequest(req, userId, tenantId);
      // `permissions` est désormais exposé par getManagedTeam (R2) : plus besoin
      // de relire le rôle du membre ni la config des rôles ici.
      if (accessHasPermission(access, 'manage_roster')) {
        const { data: managedTeamRow } = await supabaseAdmin
          .from('teams')
          .select('id, captain_id')
          .eq('id', access!.teamId)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (managedTeamRow) {
          managerTeam = {
            id: managedTeamRow.id as string,
            captainId: (managedTeamRow.captain_id as string | null) ?? null,
          };
        }
      }
    }

    if (managerTeam) {
      return await assignCaptainAsManager({
        res,
        tenantId,
        teamId: managerTeam.id,
        actorUserId: subject.callerId,
        previousCaptainId: managerTeam.captainId,
        newCaptainUserId,
      });
    }

    if (!team) {
      // Ni capitaine, ni gestionnaire de l'équipe : le refus est correct, mais
      // il doit dire pourquoi. L'ancien message parlait de capitanat à
      // quelqu'un qui n'en réclamait pas.
      return res.status(403).json({
        error:
          "Seule la capitaine, ou une manager de l'équipe, peut désigner la capitaine.",
      });
    }

    // Bloquer si le roster est verrouillé par un tournoi en cours :
    // changer de capitaine pendant un tournoi modifie qui peut agir
    // sur les line-ups, scrims, scores… c'est une rupture d'intégrité métier.
    // Un admin peut toujours forcer via les routes /api/admin/*.
    const lockStatus = await isTeamRosterLocked(tenantId, team.id);
    if (lockStatus.locked) {
      return res
        .status(409)
        .json({ error: rosterLockErrorMessage(lockStatus) });
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

    // Audit : designation d'un nouveau capitaine. `callerId` et non `userId` —
    // en act-as, le sujet n'a pas de row staff et on perdrait l'auteur réel.
    const staff = await getStaffByUserId(subject.callerId);
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
  },
  { tenantResolution: 'async', allowActAs: true }
);
