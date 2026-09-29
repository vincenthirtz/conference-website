// features/player/teamSettings/service.ts — ouvrir / fermer son équipe au
// recrutement et aux scrims.
//
// L'équipe et le droit sont déjà résolus par la route (`team` de
// defineSubjectRoute : getManagedTeam + assertTeamPermission, tenant du
// sujet) : le service ne reçoit que l'accès validé.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import type { TeamManagementAccess } from '@/utils/teams/managementAccess';
import { AdminError, NotFoundError } from '@/utils/admin/errors';
import { readTeamFlags, updateTeamFlags } from './repository';
import type {
  ToggleJoinableInput,
  ToggleJoinableResponse,
  ToggleScrimOpenInput,
  ToggleScrimOpenResponse,
} from './schemas';

export type TeamSettingsContext = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  team: TeamManagementAccess;
};

async function flip(
  ctx: TeamSettingsContext,
  flag: 'is_joinable' | 'open_for_scrim',
  wanted: boolean | undefined,
  logTag: string
): Promise<{ teamId: string; value: boolean }> {
  const { team, error } = await readTeamFlags(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error || !team) throw new NotFoundError('Team introuvable.');

  const value = typeof wanted === 'boolean' ? wanted : !team[flag];
  const { error: updateErr } = await updateTeamFlags(
    ctx.db,
    ctx.tenantId,
    team.id,
    { [flag]: value }
  );
  if (updateErr) {
    ctx.logger.error(`[${logTag}] update error:`, updateErr);
    throw new AdminError(500, 'internal', 'Echec de la mise a jour.');
  }
  return { teamId: team.id, value };
}

export async function toggleJoinable(
  ctx: TeamSettingsContext,
  input: ToggleJoinableInput
): Promise<ToggleJoinableResponse> {
  const { teamId, value } = await flip(
    ctx,
    'is_joinable',
    input.joinable,
    'toggle-joinable'
  );
  return {
    success: true,
    teamId,
    is_joinable: value,
    message: value
      ? 'Ton equipe est maintenant ouverte aux demandes de joueurs.'
      : 'Ton equipe est fermee aux nouvelles demandes.',
  };
}

export async function toggleScrimOpen(
  ctx: TeamSettingsContext,
  input: ToggleScrimOpenInput
): Promise<ToggleScrimOpenResponse> {
  const { teamId, value } = await flip(
    ctx,
    'open_for_scrim',
    input.open,
    'toggle-scrim-open'
  );
  return {
    success: true,
    teamId,
    open_for_scrim: value,
    message: value
      ? 'Ton équipe est maintenant ouverte aux scrims (visible sur la page publique).'
      : 'Ton équipe n’est plus affichée comme ouverte aux scrims.',
  };
}
