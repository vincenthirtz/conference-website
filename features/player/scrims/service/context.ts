// features/player/scrims/service/context.ts — ce que reçoit un service du
// module : la base, le tenant, le SUJET (appelante ou membre inspecté) et,
// quand la route l'exige, l'équipe gérée déjà autorisée (`team` de
// defineSubjectRoute : getManagedTeam + assertTeamPermission).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import type { TeamManagementAccess } from '@/utils/teams/managementAccess';

export type ScrimsCtx = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  /** Sujet de la requête. */
  userId: string;
};

export type ScrimsTeamCtx = ScrimsCtx & { team: TeamManagementAccess };
