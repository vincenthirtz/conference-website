// features/player/demandes/service/transfer.ts — demande de TRANSFERT (joueuse
// déjà dans une équipe → autre équipe), par elle-même ou proposée par sa
// capitaine / un manager. Déplacé de pages/api/demandes/transfer (lot P11).

import { LegacyAdminError } from '@/utils/admin/errors';
import {
  assertTeamPermission,
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { findExclusiveMembership } from '@/utils/teams/memberships';
import {
  findPendingDemande,
  insertDemande,
  listMyDemandes,
} from '../repository/demandes';
import { readTeam, readTeamMembership } from '../repository/teams';
import type { TransferDemandeInput } from '../schemas';
import {
  displayNameOf,
  messageOf,
  normalizeDesiredRole,
  type DemandesCtx,
} from './context';

const TARGET_MISSING = "L'equipe cible n'existe pas.";
const NOT_JOINABLE = "Cette equipe n'accepte pas les demandes pour le moment.";

export async function listTransferDemandes(ctx: DemandesCtx) {
  const { demandes, error } = await listMyDemandes(
    ctx.db,
    ctx.tenantId,
    ctx.userId,
    'transfer',
    { withTeam: true }
  );
  if (error) {
    ctx.logger.error('[demandes/transfer] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load requests.');
  }
  return { demandes };
}

/** Équipe cible active et ouverte aux demandes. */
async function readJoinableTarget(ctx: DemandesCtx, teamId: string) {
  const { team, error } = await readTeam(
    ctx.db,
    ctx.tenantId,
    teamId,
    'id, name, is_joinable',
    { activeOnly: true }
  );
  if (error || !team) throw new LegacyAdminError(400, TARGET_MISSING);
  if (!team.is_joinable) throw new LegacyAdminError(400, NOT_JOINABLE);
  return team;
}

/**
 * @param requestedTeamId équipe gérée désignée par `?teamId=` (multi-équipe),
 *   `null` = le serveur choisit (mono-équipe) — cf. `getManagedTeam`.
 */
export async function submitTransferDemande(
  ctx: DemandesCtx,
  body: TransferDemandeInput,
  requestedTeamId: string | null
) {
  const message = messageOf(body.message);
  const targetPlayerId = body.targetPlayerId?.trim();
  return targetPlayerId
    ? proposeTransfer(ctx, body, targetPlayerId, message, requestedTeamId)
    : requestOwnTransfer(ctx, body, message);
}

/** Capitaine / manager : propose le transfert d'une de ses joueuses. */
async function proposeTransfer(
  ctx: DemandesCtx,
  body: TransferDemandeInput,
  targetPlayerId: string,
  message: string | null,
  requestedTeamId: string | null
) {
  const { db, tenantId, userId, user } = ctx;
  const teamId = body.teamId;

  const access = await getManagedTeam(userId, tenantId, requestedTeamId);
  if (!access) throw new LegacyAdminError(403, TEAM_MANAGEMENT_FORBIDDEN);
  // Permission fine (R2) : le rôle doit couvrir `manage_roster`.
  const denied = assertTeamPermission(access, 'manage_roster');
  if (denied) throw new LegacyAdminError(denied.status, denied.error);

  const { team: captTeam } = await readTeam(
    db,
    tenantId,
    access.teamId,
    'id, name'
  );
  if (!captTeam) throw new LegacyAdminError(404, 'Team introuvable.');

  const { membership, error: memErr } = await readTeamMembership(
    db,
    tenantId,
    captTeam.id,
    targetPlayerId
  );
  if (memErr) {
    ctx.logger.error('[demandes/transfer] player check error:', memErr);
    throw new LegacyAdminError(500, 'Verification error.');
  }
  if (!membership) {
    throw new LegacyAdminError(400, "Ce joueur n'est pas dans ton equipe.");
  }
  if (targetPlayerId === userId) {
    throw new LegacyAdminError(
      400,
      'Utilise le mode transfert classique pour toi-meme.'
    );
  }
  if (captTeam.id === teamId) {
    throw new LegacyAdminError(400, 'Le joueur est deja dans cette equipe.');
  }

  const targetTeam = await readJoinableTarget(ctx, teamId);

  const { pending, error: existErr } = await findPendingDemande(db, tenantId, {
    userId: targetPlayerId,
    types: ['join', 'transfer'],
  });
  if (existErr) {
    ctx.logger.error('[demandes/transfer] check existing error:', existErr);
    throw new LegacyAdminError(500, 'Verification error.');
  }
  if (pending) {
    throw new LegacyAdminError(
      400,
      'Ce joueur a deja une demande en attente.',
      { extra: { existingDemandeId: pending.id } }
    );
  }

  const { data: playerData } = await db.auth.admin.getUserById(targetPlayerId);
  const playerUser = playerData?.user;

  const payload: Record<string, unknown> = {
    user_email: playerUser?.email || null,
    user_display_name: playerUser ? displayNameOf(playerUser) : null,
    user_battle_tag:
      membership.battle_tag || playerUser?.user_metadata?.battle_tag || null,
    team_name: targetTeam.name,
    desired_role: normalizeDesiredRole(body.desiredRole),
    from_team_id: captTeam.id,
    from_team_name: captTeam.name,
    proposed_by_captain: true,
    proposed_by_user_id: userId,
    proposed_by_display_name: displayNameOf(user) || user.email,
  };

  const { demande, error: insertErr } = await insertDemande(db, tenantId, {
    user_id: targetPlayerId,
    team_id: teamId,
    type: 'transfer',
    comment: message,
    payload,
  });
  if (insertErr) {
    ctx.logger.error('[demandes/transfer] captain insert error:', insertErr);
    throw new LegacyAdminError(500, 'Failed to create request.');
  }

  const playerName =
    (playerUser ? displayNameOf(playerUser) : null) ||
    playerUser?.email?.split('@')[0] ||
    'le joueur';

  return {
    success: true,
    demande,
    message: `La proposition de transfert de ${playerName} vers "${targetTeam.name}" a ete envoyee.`,
  };
}

/** La joueuse demande son propre transfert. */
async function requestOwnTransfer(
  ctx: DemandesCtx,
  body: TransferDemandeInput,
  message: string | null
) {
  const { db, tenantId, userId, user } = ctx;
  const teamId = body.teamId;

  // Appartenance EXCLUSIVE : un siège de manager n'est pas une équipe qu'on
  // quitte par transfert.
  const currentMembership = await findExclusiveMembership(userId, tenantId);
  if (!currentMembership) {
    throw new LegacyAdminError(
      400,
      "Tu n'es membre d'aucune equipe. Utilise la demande de join a la place."
    );
  }
  if (currentMembership.team_id === teamId) {
    throw new LegacyAdminError(400, 'Tu es deja dans cette equipe.');
  }

  const { team: currentTeam } = await readTeam(
    db,
    tenantId,
    currentMembership.team_id,
    'captain_id, name'
  );
  if (currentTeam?.captain_id === userId) {
    throw new LegacyAdminError(
      403,
      "Le capitaine ne peut pas demander un transfert. Transfere le role de capitaine d'abord."
    );
  }

  const targetTeam = await readJoinableTarget(ctx, teamId);

  const { pending, error: existingErr } = await findPendingDemande(
    db,
    tenantId,
    { userId, types: ['join', 'transfer'] }
  );
  if (existingErr) {
    ctx.logger.error('[demandes/transfer] check existing error:', existingErr);
    throw new LegacyAdminError(500, 'Verification error.');
  }
  if (pending) {
    throw new LegacyAdminError(
      400,
      "Tu as deja une demande en attente. Annule-la d'abord.",
      { extra: { existingDemandeId: pending.id } }
    );
  }

  const payload: Record<string, unknown> = {
    user_email: user.email,
    user_display_name: displayNameOf(user),
    user_battle_tag: user.user_metadata?.battle_tag || null,
    team_name: targetTeam.name,
    desired_role: normalizeDesiredRole(body.desiredRole),
    from_team_id: currentMembership.team_id,
    from_team_name: currentTeam?.name || null,
  };

  const { demande, error: insertErr } = await insertDemande(db, tenantId, {
    user_id: userId,
    team_id: teamId,
    type: 'transfer',
    comment: message,
    payload,
  });
  if (insertErr) {
    ctx.logger.error('[demandes/transfer] insert error:', insertErr);
    throw new LegacyAdminError(500, 'Failed to create request.');
  }

  return {
    success: true,
    demande,
    message: `Ta demande de transfert vers "${targetTeam.name}" a ete envoyee. Le capitaine de l'equipe cible la validera.`,
  };
}
