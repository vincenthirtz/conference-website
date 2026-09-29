// features/admin/users/service/playerActions.ts — les deux gestes du centre de
// commande « Vue joueuse » qui ne peuvent PAS réutiliser un endpoint existant :
//
//   - `assign_captain` : promouvoir la cible capitaine de SON équipe
//     (/api/teams/transfer-captain est cadré sur le demandeur) ;
//   - `transfer_team`  : déplacer la cible vers une autre équipe du tenant
//     (retrait de l'appartenance exclusive, puis insertion ; rollback
//     best-effort si l'insertion échoue).
//
// Tout est cadré sur le tenant ACTIF du staff et le `userId` CIBLE.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { adminErrorFromStatus } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { firstParam } from '@/utils/admin/pathParams';
import {
  findExclusiveMembership,
  listMemberships,
  pickExclusiveMembership,
} from '@/utils/teams/memberships';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';
import {
  insertTeamMember,
  setTeamCaptain,
  validateBattleTag,
} from '@/utils/teams/addMember';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository';

type ActionResult = { success: true; info?: string; teamId?: string };

const fail = (status: number, message: string) =>
  adminErrorFromStatus(status, message);

export async function runPlayerAction(
  ctx: ServiceContext,
  rawUserId: unknown,
  body: { action?: unknown; teamId?: unknown; battleTag?: unknown }
): Promise<Audited<ActionResult>> {
  const userId = firstParam(rawUserId);
  if (!userId || typeof userId !== 'string' || !isValidUUID(userId)) {
    throw fail(400, 'Invalid userId');
  }
  const action = (body.action as string | undefined) ?? '';
  if (action === 'assign_captain') return assignCaptain(ctx, userId);
  if (action === 'transfer_team') return transferTeam(ctx, userId, body);
  throw fail(400, 'Unsupported action');
}

async function assignCaptain(
  ctx: ServiceContext,
  userId: string
): Promise<Audited<ActionResult>> {
  // Appartenance EXCLUSIVE : un capitaine joue, un siège de manager n'en est pas.
  const membership = await findExclusiveMembership(userId, ctx.tenantId);
  const teamId = membership?.team_id ?? null;
  if (!teamId) throw fail(400, "Ce joueur n'appartient à aucune équipe.");

  const team = await repo.findTeam(ctx.db, ctx.tenantId, teamId);
  if (!team) throw fail(404, 'Équipe introuvable.');
  if (team.captain_id === userId) {
    throw fail(400, 'Ce joueur est déjà capitaine de son équipe.');
  }
  const previousCaptainId = team.captain_id ?? null;

  const result = await setTeamCaptain(teamId, userId, ctx.tenantId);
  if (!result.ok) throw fail(result.status, result.error);

  return {
    result: { success: true, info: 'Capitanat transféré.', teamId },
    audit: {
      action: 'assign_team_captain',
      entity_type: 'team',
      entity_id: teamId,
      payload: {
        newCaptainUserId: userId,
        previousCaptainUserId: previousCaptainId,
        via: 'player-view',
      },
    },
  };
}

async function transferTeam(
  ctx: ServiceContext,
  userId: string,
  body: { teamId?: unknown; battleTag?: unknown }
): Promise<Audited<ActionResult>> {
  const tenantId = ctx.tenantId;
  const targetTeamId = body.teamId;
  if (!targetTeamId || typeof targetTeamId !== 'string') {
    throw fail(400, 'teamId (destination) requis.');
  }

  const destTeam = await repo.findTeam(ctx.db, tenantId, targetTeamId);
  if (!destTeam) throw fail(404, 'Équipe de destination introuvable.');

  // Un transfert déplace une JOUEUSE : on part de l'appartenance exclusive.
  const currentRows = await listMemberships<{
    id: string;
    team_id: string;
    role: string | null;
    battle_tag: string | null;
    accepted_at: string | null;
  }>(userId, tenantId, 'id, team_id, role, battle_tag, accepted_at');
  const current = pickExclusiveMembership(currentRows);

  const sourceTeamId = current?.team_id ?? null;
  if (sourceTeamId === targetTeamId) {
    throw fail(400, 'Le joueur est déjà dans cette équipe.');
  }

  // BattleTag : surcharge explicite > reporté > erreur (le roster l'exige).
  const overrideTag =
    typeof body.battleTag === 'string' ? body.battleTag : null;
  let battleTagValue: string;
  try {
    battleTagValue = validateBattleTag(
      overrideTag ?? current?.battle_tag ?? null
    );
  } catch {
    throw fail(
      400,
      'BattleTag requis pour le transfert (format Name#0000). Renseignez-le avant de transférer.'
    );
  }

  const role =
    typeof current?.role === 'string' && current.role.trim()
      ? current.role
      : 'player';

  // 1. Libère la contrainte « une seule équipe ».
  if (current?.id) {
    const { error: delErr } = await repo.deleteMembership(
      ctx.db,
      tenantId,
      current.id
    );
    if (delErr) {
      ctx.logger.error('[admin/users/actions] transfer delete error:', delErr);
      throw fail(500, 'Échec du retrait de l’équipe actuelle.');
    }
    if (sourceTeamId) {
      await repo.vacateCaptaincy(ctx.db, tenantId, sourceTeamId, userId);
    }
    void emitRoleSyncEvent('team.member.removed', userId, tenantId, {
      extras: { teamId: sourceTeamId },
    });
  }

  // 2. Insère dans l'équipe de destination (max_players + doublon gérés).
  const insertResult = await insertTeamMember({
    tenantId,
    teamId: targetTeamId,
    userId,
    role,
    battleTag: battleTagValue,
    enforceMaxPlayersPreCheck: true,
    // Le rattachement TCG est une affaire d'ESPACE : l'accord est reporté.
    acceptedAt: current?.accepted_at ?? null,
  });

  if (!insertResult.ok) {
    // Rollback best-effort : ne pas laisser la joueuse sans équipe.
    if (current?.id && sourceTeamId) {
      await insertTeamMember({
        tenantId,
        teamId: sourceTeamId,
        userId,
        role,
        battleTag: battleTagValue,
        acceptedAt: current?.accepted_at ?? null,
      });
    }
    throw fail(insertResult.status, insertResult.error);
  }

  return {
    result: { success: true, info: 'Joueur transféré.', teamId: targetTeamId },
    audit: {
      action: 'transfer_player_team',
      entity_type: 'user',
      entity_id: userId,
      payload: {
        fromTeamId: sourceTeamId,
        toTeamId: targetTeamId,
        role,
        via: 'player-view',
      },
    },
  };
}
