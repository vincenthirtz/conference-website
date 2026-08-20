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
  validate_lineup:
    "Ton rôle dans l'équipe ne permet pas de valider la feuille de match.",
};

/**
 * Toutes les teams que `userId` gère, dans le tenant donné.
 *
 * Règles :
 *  - Capitaine d'une équipe ⇒ toutes les permissions sur elle.
 *  - Rôle `team_members` privilégié (≥ 1 permission, config dynamique
 *    `site_settings.team_roles`) ⇒ les permissions de ce rôle.
 *  - Une même équipe n'apparaît qu'une fois : la capitainerie l'emporte sur le
 *    rôle de membre (permissions strictement plus larges).
 *  - Ordre STABLE et signifiant : les équipes dont on est capitaine d'abord,
 *    puis les équipes encadrées par ancienneté d'adhésion (`created_at`).
 *    C'est ce qui rend le repli « sans `teamId`, prends la première » (cf.
 *    `getManagedTeam`) déterministe.
 *  - On ne considère que les teams actives implicitement (RLS / API en aval).
 *
 * **Multi-équipe (2026-08-20)** : un `manager` peut désormais encadrer
 * plusieurs équipes (index unique partiel, cf.
 * `database/migrations/allow_manager_multi_team.sql`). Cette fonction est le
 * seul endroit qui sait le lire — les routes passent, elles, par
 * `getManagedTeamForRequest` (utils/teams/teamScope.ts) qui résout l'équipe
 * ciblée par la requête.
 *
 * **Multi-tenant (S5c)** : les deux queries sont scopées au tenant.
 */
export async function getManagedTeams(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: { teamId?: string | null } = {}
): Promise<TeamManagementAccess[]> {
  if (!userId) return [];
  if (!supabaseAdmin) {
    logger.error('[getManagedTeams] supabaseAdmin unavailable');
    return [];
  }

  const onlyTeamId = options.teamId || null;

  // Les rôles d'équipe (site_settings) sont chargés en parallèle de la query
  // capitaine : ils ne servent qu'à la seconde, et la latence ne s'additionne
  // pas. Avant le multi-équipe, un capitaine court-circuitait tout — ce
  // raccourci n'est plus valide : on peut être capitaine d'une équipe ET
  // manager d'une autre.
  let captainQuery = supabaseAdmin
    .from('teams')
    .select('id')
    .eq('captain_id', userId)
    .eq('tenant_id', tenantId);
  if (onlyTeamId) captainQuery = captainQuery.eq('id', onlyTeamId);

  const [captainRes, roles] = await Promise.all([
    captainQuery,
    loadTeamRolesFromSupabase(supabaseAdmin),
  ]);

  if (captainRes.error) {
    logger.error('[getManagedTeams] captain query error', captainRes.error);
  }

  const accesses: TeamManagementAccess[] = [];
  const seen = new Set<string>();

  for (const row of (captainRes.data as { id: string }[] | null) ?? []) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    // La capitaine a TOUTES les permissions, par définition du rôle.
    accesses.push({
      teamId: row.id,
      isCaptain: true,
      isManager: false,
      permissions: [...TEAM_PERMISSION_VALUES],
    });
  }

  const privileged = privilegedRoleValues(roles);
  if (privileged.length === 0) return accesses;

  // On lit AUSSI le rôle (pas seulement team_id) : c'est lui qui détermine les
  // permissions effectives. Aucune requête supplémentaire.
  let memberQuery = supabaseAdmin
    .from('team_members')
    .select('team_id, role, created_at')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('role', privileged)
    .order('created_at', { ascending: true });
  if (onlyTeamId) memberQuery = memberQuery.eq('team_id', onlyTeamId);

  const { data: memberRows, error: mgrErr } = await memberQuery;

  if (mgrErr) {
    logger.error('[getManagedTeams] manager query error', mgrErr);
  }

  for (const row of (memberRows as
    | { team_id: string | null; role: string | null }[]
    | null) ?? []) {
    const teamId = row?.team_id;
    if (!teamId || seen.has(teamId)) continue;
    const normalized = row.role?.trim().toLowerCase() ?? '';
    const permissions = roles.find((r) => r.value === normalized)?.permissions;
    // Le rôle vient d'un `.in('role', privileged)` : il est forcément dans
    // `roles` avec >= 1 permission. La garde couvre le cas dégénéré (config
    // modifiée entre les deux lectures) sans inventer un accès vide, qui
    // passerait les gardes « access non nul » des appelants.
    if (!permissions || permissions.length === 0) continue;
    seen.add(teamId);
    accesses.push({
      teamId,
      isCaptain: false,
      isManager: true,
      permissions: [...permissions],
    });
  }

  return accesses;
}

/**
 * Accès de `userId` à UNE équipe.
 *
 * - `teamId` fourni → l'accès à CETTE équipe, ou `null` s'il n'en a aucun.
 *   C'est le mode à utiliser depuis une route : cf.
 *   `getManagedTeamForRequest`, qui lit `?teamId=` pour l'appeler.
 * - `teamId` absent → repli historique « mon équipe » : la première équipe
 *   gérée dans l'ordre stable de `getManagedTeams` (capitainerie d'abord).
 *   Conserve le comportement d'avant le multi-équipe pour tout appelant qui
 *   n'a qu'une équipe — c'est-à-dire l'immense majorité.
 */
export async function getManagedTeam(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  teamId?: string | null
): Promise<TeamManagementAccess | null> {
  if (teamId) {
    const scoped = await getManagedTeams(userId, tenantId, { teamId });
    return scoped.find((a) => a.teamId === teamId) ?? null;
  }
  const all = await getManagedTeams(userId, tenantId);
  return all[0] ?? null;
}

/** Petit helper pour les messages d'erreur uniformes. */
export const TEAM_MANAGEMENT_FORBIDDEN =
  'Tu dois etre capitaine ou avoir un role de gestion dans une equipe active.';
