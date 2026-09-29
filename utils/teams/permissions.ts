// Vérification runtime d'UNE permission d'un user sur UNE team.
//
// Adaptateur booléen de `getManagedTeam` + `assertTeamPermission`
// (utils/teams/managementAccess.ts) — un seul cœur de décision, pas deux :
//   - le capitaine a TOUTES les permissions ;
//   - sinon, rôle `team_members` × config des rôles du TENANT DE L'ÉQUIPE ;
//   - ∪ les surcharges déléguées par membre (J3, `team_member_permissions`).
//
// Lot P0 (docs/PLAN-industrialisation-joueur.md) :
//   - S1 : plus AUCUN contournement staff. Un compte staff global ≥ admin
//     avait toutes les permissions sur toutes les équipes, tous tenants
//     confondus, sans journal. Le staff modère via `/api/admin/teams/*` ou
//     via l'act-as journalisé (`utils/subject.ts`, `act_as_player`).
//   - S2 : la config des rôles était celle du tenant par défaut quelle que
//     soit l'équipe, et `teams` était lue sans filtre tenant. Le tenant est
//     désormais celui de l'équipe, et `getManagedTeam` filtre par lui.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  assertTeamPermission,
  getManagedTeam,
} from '@/utils/teams/managementAccess';
import type { TeamPermission } from '@/utils/teamRoles';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import type { SubjectContext } from '@/utils/subject';

/**
 * Tenant d'une équipe (celui qui fait foi pour ses rôles, ses surcharges et
 * toute écriture la concernant), `null` si l'équipe est introuvable.
 */
export async function readTeamTenantId(
  teamId: string | null | undefined
): Promise<string | null> {
  if (!teamId) return null;
  if (!supabaseAdmin) {
    logger.error('[hasTeamPermission] supabaseAdmin unavailable');
    return null;
  }
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, tenant_id')
    .eq('id', teamId)
    .maybeSingle();

  if (teamErr) {
    logger.error('[hasTeamPermission] team lookup error', teamErr);
    return null;
  }
  if (!team) return null;
  return (team as { tenant_id?: string | null }).tenant_id || DEFAULT_TENANT_ID;
}

/**
 * Accès de `userId` à `teamId` pour `permission`, résolu dans le TENANT DE
 * L'ÉQUIPE. Rend ce tenant quand le droit est acquis (les écritures qui
 * suivent s'y scopent), `null` sinon — équipe absente comprise.
 *
 * Pourquoi rendre le tenant : les routes `teams/[teamId]/*` le prenaient de
 * `resolveTenantIdForUserRequest` (tenant du chemin, donc par défaut) ; pour
 * une équipe d'un autre tenant, le droit passait ici mais la lecture
 * `.eq('tenant_id', …)` qui suivait ne trouvait rien (P10).
 */
export async function resolveTeamPermission(
  userId: string | null | undefined,
  teamId: string | null | undefined,
  permission: TeamPermission
): Promise<{ tenantId: string } | null> {
  if (!userId || !teamId) return null;
  const tenantId = await readTeamTenantId(teamId);
  if (!tenantId) return null;
  const access = await getManagedTeam(userId, tenantId, teamId);
  return assertTeamPermission(access, permission) === null
    ? { tenantId }
    : null;
}

export async function hasTeamPermission(
  userId: string | null | undefined,
  teamId: string | null | undefined,
  permission: TeamPermission
): Promise<boolean> {
  return (await resolveTeamPermission(userId, teamId, permission)) !== null;
}

/**
 * `resolveTeamPermission` pour le SUJET d'une route `withSubjectRoute`
 * (`allowActAs`) : le droit est celui de la personne représentée, jamais du
 * staff. Sous act-as, l'équipe doit en plus appartenir au tenant ACTIF du
 * staff (celui où `resolveSubject` a validé l'act-as et écrit le journal
 * `act_as_player`) : une capitaine présente dans deux tenants ne fait pas
 * passer le staff de l'un sur une équipe de l'autre.
 */
export async function resolveSubjectTeamPermission(
  subject: Pick<SubjectContext, 'userId' | 'tenantId' | 'isInspection'>,
  teamId: string | null | undefined,
  permission: TeamPermission
): Promise<{ tenantId: string } | null> {
  const grant = await resolveTeamPermission(subject.userId, teamId, permission);
  if (!grant) return null;
  if (subject.isInspection && grant.tenantId !== subject.tenantId) return null;
  return grant;
}
