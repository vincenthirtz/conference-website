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

export async function hasTeamPermission(
  userId: string | null | undefined,
  teamId: string | null | undefined,
  permission: TeamPermission
): Promise<boolean> {
  if (!userId || !teamId) return false;
  if (!supabaseAdmin) {
    logger.error('[hasTeamPermission] supabaseAdmin unavailable');
    return false;
  }

  // Le tenant qui fait foi est celui de l'équipe : c'est sa config de rôles
  // et ses surcharges qui s'appliquent, pas celles du tenant par défaut.
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, tenant_id')
    .eq('id', teamId)
    .maybeSingle();

  if (teamErr) {
    logger.error('[hasTeamPermission] team lookup error', teamErr);
    return false;
  }
  if (!team) return false;

  const tenantId =
    (team as { tenant_id?: string | null }).tenant_id || DEFAULT_TENANT_ID;
  const access = await getManagedTeam(userId, tenantId, teamId);
  return assertTeamPermission(access, permission) === null;
}
