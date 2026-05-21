// Centralise la notion de "user pouvant gerer une team" : capitaine OU membre
// dont le role accorde au moins une permission de gestion (config dynamique
// dans site_settings.team_roles, cf. utils/teamRoles.ts).
//
// Les API routes qui gerent le roster, les scrims, les messages capitaine,
// etc. doivent appeler ce helper plutot que de checker directement
// teams.captain_id ou team_members.role.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  loadTeamRolesFromSupabase,
  privilegedRoleValues,
} from '@/utils/teamRoles';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

export type TeamManagementAccess = {
  teamId: string;
  /** true si l'user est le captain_id de l'equipe */
  isCaptain: boolean;
  /** true si l'user a un team_members.role accordant >=1 permission */
  isManager: boolean;
};

/**
 * Retourne la team que l'user gere (en tant que capitaine OU via un role
 * accordant des permissions de gestion), ou null s'il n'a aucun droit.
 *
 * Regles :
 *  - Un user n'a au plus qu'une "team manageriale" : on est capitaine d'une
 *    seule equipe, et on n'a un role privilegie que dans une seule equipe
 *    (regle metier).
 *  - Si on est capitaine d'une equipe ET on a un role privilegie dans une
 *    autre, on retourne celle dont on est capitaine (priorite la plus forte).
 *  - On ne considere que les teams actives implicitement (RLS / API en aval).
 *
 * **Multi-tenant (S5c)** : si `tenantId` est fourni, les deux queries (team
 * dont l'user est capitaine, team_members privilégiés) sont scopées au
 * tenant. En V1 mono-tenant, les callers passent `DEFAULT_TENANT_ID` ; à
 * terme (S7) on lira la team du user pour résoudre son tenant.
 */
export async function getManagedTeam(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TeamManagementAccess | null> {
  if (!userId) return null;
  if (!supabaseAdmin) {
    logger.error('[getManagedTeam] supabaseAdmin unavailable');
    return null;
  }

  // 1. Capitaine ?
  const { data: captainTeam, error: captainErr } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('captain_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (captainErr) {
    logger.error('[getManagedTeam] captain query error', captainErr);
  }

  if (captainTeam?.id) {
    return { teamId: captainTeam.id, isCaptain: true, isManager: false };
  }

  // 2. Role privilegie (>=1 permission) dans une team ?
  const roles = await loadTeamRolesFromSupabase(supabaseAdmin);
  const privileged = privilegedRoleValues(roles);
  if (privileged.length === 0) return null;

  const { data: managerRow, error: mgrErr } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('role', privileged)
    .maybeSingle();

  if (mgrErr) {
    logger.error('[getManagedTeam] manager query error', mgrErr);
  }

  if (managerRow?.team_id) {
    return {
      teamId: managerRow.team_id,
      isCaptain: false,
      isManager: true,
    };
  }

  return null;
}

/** Petit helper pour les messages d'erreur uniformes. */
export const TEAM_MANAGEMENT_FORBIDDEN =
  "Tu dois etre capitaine ou avoir un role de gestion dans une equipe active.";
