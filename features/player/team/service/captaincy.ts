// features/player/team/service/captaincy.ts — PATCH /api/teams/transfer-captain
// (lot P10, même contrat). Deux acteurs :
//   1. la CAPITAINE en poste → transfert (RPC `transfer_captain`) ;
//   2. une MANAGER de l'équipe (`manage_roster`) → attribution du capitanat
//      (RPC `reassign_captain`), poste vacant ou occupé : tenir le roster est
//      son métier, et une capitaine inactive bloquait sinon l'équipe.
// Roster verrouillé par un tournoi → 409 dans les deux cas (l'admin force via
// /api/admin/*). Mutation atomique côté RPC.
//
// Pas de `team: { permission }` sur la route : la capitaine est trouvée par
// son capitanat (capitanat voulu, S4), et le refus a son propre message. Le
// chemin manager passe par la même garde (`getManagedTeam` + permission).

import { getStaffByUserId } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { mapTeamRpcError } from '@/utils/teams/rpcErrors';
import {
  accessHasPermission,
  getManagedTeam,
} from '@/utils/teams/managementAccess';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';
import {
  findCaptainTeam,
  readTeamHead,
  rpcReassignCaptain,
  rpcTransferCaptain,
} from '../repository/roster';
import type { TransferCaptainInput } from '../schemas';
import { fail, type TeamSubjectContext } from './context';

async function assertRosterOpen(tenantId: string, teamId: string) {
  const lock = await isTeamRosterLocked(tenantId, teamId);
  if (lock.locked) throw fail(409, rosterLockErrorMessage(lock));
}

function rpcFailure(ctx: TeamSubjectContext, rpc: string, err: never) {
  const mapped = mapTeamRpcError(err);
  if (mapped.status >= 500) {
    ctx.logger.error(`[transfer-captain] ${rpc} rpc error:`, err);
  }
  return fail(mapped.status, mapped.error);
}

/** Bot role-sync : l'ancienne perd le rôle Discord, la nouvelle le gagne. */
function emitCaptainChanged(
  ctx: TeamSubjectContext,
  teamId: string,
  previous: string | null,
  next: string
) {
  if (previous) {
    void emitRoleSyncEvent('team.captain.changed', previous, ctx.tenantId, {
      extras: { teamId, role: 'previous' },
    }).catch(ctx.logger.error);
  }
  void emitRoleSyncEvent('team.captain.changed', next, ctx.tenantId, {
    extras: { teamId, role: 'new' },
  }).catch(ctx.logger.error);
}

/** Journal sur la row staff de l'APPELANT (`callerId`, act-as compris). */
async function logAssignment(
  ctx: TeamSubjectContext,
  teamId: string,
  payload: Record<string, unknown>
) {
  const staff = await getStaffByUserId(ctx.subject.callerId);
  if (!staff?.id) return;
  await logStaffAction({
    staff_id: staff.id,
    action: 'assign_team_captain',
    entity_type: 'team',
    entity_id: teamId,
    tenant_id: ctx.tenantId,
    payload,
  });
}

/**
 * Chemin MANAGER. `previousCaptainId` est lu AVANT la mutation : il décide
 * de désynchroniser un ancien capitaine côté Discord (sinon deux capitaines
 * visibles pour une équipe qui n'en a qu'une).
 */
async function assignAsManager(
  ctx: TeamSubjectContext,
  teamId: string,
  previousCaptainId: string | null,
  newCaptainUserId: string
) {
  await assertRosterOpen(ctx.tenantId, teamId);
  const { error } = await rpcReassignCaptain(ctx.db, {
    teamId,
    newCaptain: newCaptainUserId,
    tenantId: ctx.tenantId,
  });
  if (error) throw rpcFailure(ctx, 'reassign_captain', error as never);

  emitCaptainChanged(ctx, teamId, previousCaptainId, newCaptainUserId);
  await logAssignment(ctx, teamId, {
    previous_captain_id: previousCaptainId,
    new_captain_id: newCaptainUserId,
    designated_by: 'manager',
  });
  return {
    success: true,
    info: previousCaptainId
      ? 'Capitanat réattribué avec succès.'
      : 'Capitaine désignée avec succès.',
    newCaptainUserId,
  };
}

export async function transferCaptain(
  ctx: TeamSubjectContext,
  body: TransferCaptainInput,
  requestedTeamId: string | null
) {
  const { db, tenantId } = ctx;
  const userId = ctx.subject.userId;
  const { newCaptainUserId } = body;

  if (newCaptainUserId === userId) throw fail(400, 'Tu es déjà capitaine.');

  const { team, error: teamErr } = await findCaptainTeam(db, tenantId, userId);
  if (teamErr) {
    ctx.logger.error('[transfer-captain] team lookup error:', teamErr);
    throw fail(500, 'Failed to find your team.');
  }

  if (!team) {
    // Chemin MANAGER : capitaine de rien, mais gère une équipe.
    const access = await getManagedTeam(userId, tenantId, requestedTeamId);
    if (access && accessHasPermission(access, 'manage_roster')) {
      const { team: managed } = await readTeamHead(db, tenantId, access.teamId);
      if (managed) {
        return assignAsManager(
          ctx,
          managed.id,
          managed.captain_id ?? null,
          newCaptainUserId
        );
      }
    }
    throw fail(
      403,
      "Seule la capitaine, ou une manager de l'équipe, peut désigner la capitaine."
    );
  }

  // Changer de capitaine pendant un tournoi modifie qui agit sur les
  // line-ups, scrims, scores : rupture d'intégrité métier.
  await assertRosterOpen(tenantId, team.id);

  // RPC transactionnelle : verrou, membre non-coach, UPDATE — pas de TOCTOU.
  const { error } = await rpcTransferCaptain(db, {
    teamId: team.id,
    newCaptain: newCaptainUserId,
    tenantId,
    actor: userId,
  });
  if (error) throw rpcFailure(ctx, 'transfer_captain', error as never);

  emitCaptainChanged(ctx, team.id, userId, newCaptainUserId);
  await logAssignment(ctx, team.id, {
    previous_captain_id: userId,
    new_captain_id: newCaptainUserId,
  });
  return {
    success: true,
    info: 'Capitanat transféré avec succès.',
    newCaptainUserId,
  };
}
