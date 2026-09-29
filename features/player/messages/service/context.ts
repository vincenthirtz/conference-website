// features/player/messages/service/context.ts — contexte et accès d'équipe
// des services de messagerie (lot P15).
//
// La LECTURE reste ouverte à toute personne qui GÈRE l'équipe (capitaine,
// manager, délégation) ; l'ENVOI et le marquage « lu » exigent
// `send_captain_messages` (R2). Contrôle fait ICI plutôt que par
// `team: { permission }` de la garde : la lecture n'exige aucune permission
// fine, et l'ordre historique des refus (id de conversation d'abord) est
// conservé.

import type { User } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { Logger } from '@/utils/logger';
import {
  assertTeamPermission,
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import type { TeamPermission } from '@/utils/teamRoles';
import * as repo from '../repository';
import type { MyTeamRow } from '../repository';

export type MessagesCtx = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  /** Le sujet (l'appelante, ou l'équipe inspectée en lecture). */
  userId: string;
};

export async function loadMyTeam(
  ctx: MessagesCtx,
  requestedTeamId: string | null,
  permission?: TeamPermission
): Promise<MyTeamRow> {
  const access = await getManagedTeam(
    ctx.userId,
    ctx.tenantId,
    requestedTeamId
  );
  if (!access) throw new LegacyAdminError(403, TEAM_MANAGEMENT_FORBIDDEN);
  if (permission) {
    const denied = assertTeamPermission(access, permission);
    if (denied) throw new LegacyAdminError(denied.status, denied.error);
  }
  const team = await repo.readMyTeam(ctx.db, access.teamId, ctx.tenantId);
  if (!team) throw new LegacyAdminError(404, 'Team introuvable.');
  return team;
}

export type SenderUser = Pick<User, 'email' | 'user_metadata'>;
