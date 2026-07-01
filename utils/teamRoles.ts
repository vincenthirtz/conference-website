import type { SupabaseClient } from '@supabase/supabase-js';

/* -----------------------------------------------------------
 * Catalogue des permissions team
 * ---------------------------------------------------------*/

export const TEAM_PERMISSION_CATALOG = [
  {
    value: 'manage_roster',
    label: 'Gérer le roster',
    description: 'Ajouter / retirer des membres et modifier leur rôle',
  },
  {
    value: 'manage_team_info',
    label: "Modifier les infos de l'équipe",
    description: 'Nom, logo, description, pays, etc.',
  },
  {
    value: 'manage_scrims',
    label: 'Gérer les scrims',
    description: 'Créer et répondre aux demandes de scrim',
  },
  {
    value: 'manage_join_requests',
    label: 'Gérer les demandes de rejoindre',
    description: 'Accepter ou refuser les join requests',
  },
  {
    value: 'register_tournaments',
    label: 'Inscrire aux tournois',
    description: "Inscrire l'équipe à un tournoi ouvert",
  },
  {
    value: 'send_captain_messages',
    label: 'Envoyer des messages équipe',
    description: 'Diffuser un message à tous les membres',
  },
  {
    value: 'edit_public_page',
    label: 'Personnaliser la page publique',
    description:
      "Modifier la description, le contenu riche et l'apparence de la page publique de l'équipe",
  },
] as const;

export type TeamPermission = (typeof TEAM_PERMISSION_CATALOG)[number]['value'];

export const TEAM_PERMISSION_VALUES: TeamPermission[] =
  TEAM_PERMISSION_CATALOG.map((p) => p.value);

const TEAM_PERMISSION_SET = new Set<string>(TEAM_PERMISSION_VALUES);

export function isTeamPermission(value: unknown): value is TeamPermission {
  return typeof value === 'string' && TEAM_PERMISSION_SET.has(value);
}

/* -----------------------------------------------------------
 * Rôles
 * ---------------------------------------------------------*/

export type TeamRole = {
  value: string;
  label: string;
  permissions: TeamPermission[];
};

export const TEAM_ROLES_SETTING_KEY = 'team_roles';

export const DEFAULT_TEAM_ROLES: TeamRole[] = [
  { value: 'player', label: 'Player', permissions: [] },
  { value: 'coach', label: 'Coach', permissions: [] },
  { value: 'substitute', label: 'Sub', permissions: [] },
  {
    value: 'manager',
    label: 'Manager',
    permissions: [...TEAM_PERMISSION_VALUES],
  },
];

function normalizePermissions(raw: unknown): TeamPermission[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<TeamPermission>();
  for (const p of raw) {
    if (isTeamPermission(p)) seen.add(p);
  }
  return TEAM_PERMISSION_VALUES.filter((p) => seen.has(p));
}

export function parseTeamRoles(raw: string | null | undefined): TeamRole[] {
  if (!raw) return DEFAULT_TEAM_ROLES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_TEAM_ROLES;
    const seen = new Set<string>();
    const cleaned: TeamRole[] = [];
    for (const item of parsed) {
      const value =
        typeof item?.value === 'string' ? item.value.trim().toLowerCase() : '';
      const label =
        typeof item?.label === 'string' && item.label.trim()
          ? item.label.trim()
          : value.charAt(0).toUpperCase() + value.slice(1);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      cleaned.push({
        value,
        label,
        permissions: normalizePermissions(item?.permissions),
      });
    }
    return cleaned.length > 0 ? cleaned : DEFAULT_TEAM_ROLES;
  } catch {
    return DEFAULT_TEAM_ROLES;
  }
}

export function serializeTeamRoles(roles: TeamRole[]): string {
  return JSON.stringify(
    roles.map((r) => ({
      value: r.value,
      label: r.label,
      permissions: r.permissions,
    }))
  );
}

export async function loadTeamRolesFromSupabase(
  admin: SupabaseClient
): Promise<TeamRole[]> {
  const { data } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', TEAM_ROLES_SETTING_KEY)
    .maybeSingle();
  return parseTeamRoles(
    (data as { value?: string | null } | null)?.value ?? null
  );
}

/* -----------------------------------------------------------
 * Lookup helpers
 * ---------------------------------------------------------*/

/** Renvoie true si `roleValue` (tel que stocké dans team_members.role) accorde
 *  la permission `permission`, d'après la config courante `roles`. */
export function roleHasPermission(
  roles: TeamRole[],
  roleValue: string | null | undefined,
  permission: TeamPermission
): boolean {
  if (!roleValue) return false;
  const normalized = roleValue.trim().toLowerCase();
  const role = roles.find((r) => r.value === normalized);
  return !!role?.permissions.includes(permission);
}

/** Renvoie true si `roleValue` a au moins une permission. Utilisé pour
 *  l'anti-escalation : seul le capitaine peut accorder un rôle "à privilèges". */
export function roleHasAnyPermission(
  roles: TeamRole[],
  roleValue: string | null | undefined
): boolean {
  if (!roleValue) return false;
  const normalized = roleValue.trim().toLowerCase();
  const role = roles.find((r) => r.value === normalized);
  return !!role && role.permissions.length > 0;
}

/** Renvoie la liste des values de rôles ayant au moins une permission. */
export function privilegedRoleValues(roles: TeamRole[]): string[] {
  return roles.filter((r) => r.permissions.length > 0).map((r) => r.value);
}
