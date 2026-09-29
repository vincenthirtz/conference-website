// features/player/team/service/context.ts — ce que reçoivent les services de
// gestion d'équipe (lot P10) et l'erreur « contrat historique ».
//
// Les routes migrées gardent leur contrat HTTP : mêmes statuts, mêmes
// messages, et le même `code` quand elles en avaient un. `LegacyAdminError`
// le porte ; le noyau y ajoute `requestId` (et un `code` générique si la
// route n'en avait pas — ajout, pas changement).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import type { SubjectContext } from '@/utils/subject';
import type { TeamManagementAccess } from '@/utils/teams/managementAccess';
import { LegacyAdminError } from '@/utils/admin/errors';

/** Contexte d'un geste qui ne suppose pas d'équipe gérée. */
export type TeamSubjectContext = {
  db: AdminDb;
  /** Tenant du sujet (celui de la route migrée). */
  tenantId: string;
  subject: SubjectContext;
  logger: Logger;
};

/** Contexte d'un geste sur l'équipe gérée (`team: { permission }`). */
export type ManagedTeamContext = TeamSubjectContext & {
  team: TeamManagementAccess;
};

/** Erreur au contrat historique de la route : statut, message, `code` éventuel. */
export function fail(
  status: number,
  error: string,
  code?: string,
  extra?: Record<string, unknown>
): LegacyAdminError {
  return new LegacyAdminError(status, error, { code, extra });
}
