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
  TEAM_PERMISSION_VALUES,
  type TeamPermission,
} from '@/utils/teamRoles';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

export type TeamManagementAccess = {
  teamId: string;
  /** true si l'user est le captain_id de l'equipe */
  isCaptain: boolean;
  /** true si l'user a un team_members.role accordant >=1 permission */
  isManager: boolean;
  /**
   * Permissions EFFECTIVES de l'utilisateur sur cette équipe.
   *
   * Avant (bug de conception) : `getManagedTeam` ne renvoyait qu'un booléen
   * `isManager`, vrai dès qu'un rôle accordait **au moins une** permission — et
   * les ~24 routes gated en déduisaient un droit de gestion TOTAL. Confier
   * « gérer les scrims » à une coach lui donnait donc aussi le roster, les
   * messages d'équipe et les inscriptions tournoi.
   *
   * Désormais on expose la liste réelle, et chaque route exige la permission
   * qui la concerne (cf. `assertTeamPermission`). Le capitaine les a toutes.
   */
  permissions: TeamPermission[];
};

/** true si l'accès couvre `permission`. */
export function accessHasPermission(
  access: TeamManagementAccess | null | undefined,
  permission: TeamPermission
): boolean {
  return !!access?.permissions.includes(permission);
}

/**
 * Garde de route : renvoie `null` si l'accès couvre la permission, sinon le
 * couple `{ status, error }` à renvoyer tel quel.
 *
 * Usage :
 *   const denied = assertTeamPermission(access, 'manage_scrims');
 *   if (denied) return res.status(denied.status).json({ error: denied.error });
 */
export function assertTeamPermission(
  access: TeamManagementAccess | null | undefined,
  permission: TeamPermission
): { status: 403; error: string } | null {
  if (!access) {
    return { status: 403, error: TEAM_MANAGEMENT_FORBIDDEN };
  }
  if (accessHasPermission(access, permission)) return null;
  return {
    status: 403,
    error: TEAM_PERMISSION_FORBIDDEN[permission],
  };
}

/** Messages d'erreur par permission — explicites sur ce qui manque. */
const TEAM_PERMISSION_FORBIDDEN: Record<TeamPermission, string> = {
  manage_roster: "Ton rôle dans l'équipe ne permet pas de gérer le roster.",
  manage_team_info:
    "Ton rôle dans l'équipe ne permet pas de modifier ses informations.",
  manage_scrims: "Ton rôle dans l'équipe ne permet pas de gérer les scrims.",
  manage_join_requests:
    "Ton rôle dans l'équipe ne permet pas de traiter les demandes.",
  register_tournaments:
    "Ton rôle dans l'équipe ne permet pas d'inscrire l'équipe à un tournoi.",
  send_captain_messages:
    "Ton rôle dans l'équipe ne permet pas d'envoyer des messages d'équipe.",
  edit_public_page:
    "Ton rôle dans l'équipe ne permet pas d'éditer sa page publique.",
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
    // La capitaine a TOUTES les permissions, par définition du rôle.
    return {
      teamId: captainTeam.id,
      isCaptain: true,
      isManager: false,
      permissions: [...TEAM_PERMISSION_VALUES],
    };
  }

  // 2. Role privilegie (>=1 permission) dans une team ?
  const roles = await loadTeamRolesFromSupabase(supabaseAdmin);
  const privileged = privilegedRoleValues(roles);
  if (privileged.length === 0) return null;

  // On lit AUSSI le rôle (pas seulement team_id) : c'est lui qui détermine les
  // permissions effectives. Aucune requête supplémentaire.
  const { data: managerRow, error: mgrErr } = await supabaseAdmin
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('role', privileged)
    .maybeSingle();

  if (mgrErr) {
    logger.error('[getManagedTeam] manager query error', mgrErr);
  }

  if (managerRow?.team_id) {
    const roleValue = (managerRow as { role?: string | null }).role ?? null;
    const normalized = roleValue?.trim().toLowerCase() ?? '';
    const permissions =
      roles.find((r) => r.value === normalized)?.permissions ?? [];
    return {
      teamId: managerRow.team_id,
      isCaptain: false,
      isManager: true,
      permissions: [...permissions],
    };
  }

  return null;
}

/** Petit helper pour les messages d'erreur uniformes. */
export const TEAM_MANAGEMENT_FORBIDDEN =
  'Tu dois etre capitaine ou avoir un role de gestion dans une equipe active.';
