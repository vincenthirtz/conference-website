// utils/admin/adminAccess.ts — la règle d'accès d'un LIEN admin (lot L14,
// docs/PLAN-industrialisation-admin.md).
//
// Trois surfaces mènent à des pages admin : le menu (`ADMIN_NAV`), les onglets
// de la Diffusion (`DIFFUSION_TABS`) et les raccourcis de la palette ⌘K. Chacune
// décidait à sa façon qui voyait quoi — la palette, pas du tout. Une seule
// règle ici, et `tests/unit/adminLinkGuards.test.ts` vérifie qu'aucun lien
// n'est plus ouvert que la page qu'il ouvre (le « menu mort » qui mène à un
// 403).
//
// Client-safe : ni Supabase, ni Next.

import {
  hasAtLeastRole,
  STAFF_ROLES,
  type StaffRole,
} from '@/utils/staffRoles';
import {
  hasStaffPermission,
  roleHasStaffPermission,
  type StaffPermission,
} from '@/utils/staffPermissions';

export type AccessRule =
  | { minRole: StaffRole }
  | { permission: StaffPermission };

/** Tout le staff, y compris les rôles étroits (bénévole, arbitre). */
export const ANY_STAFF: AccessRule = { minRole: 'helper' };

export function canAccess(
  rule: AccessRule,
  role: StaffRole | null | undefined,
  /** Permissions EFFECTIVES (rôle + accordées à l'unité), si connues. */
  permissions?: readonly string[] | null
): boolean {
  if ('permission' in rule)
    return hasStaffPermission(role, permissions, rule.permission);
  return hasAtLeastRole(role, rule.minRole);
}

/** Rôles admis par la règle, au seul titre de leur rôle. */
export function rolesAdmitted(rule: AccessRule): StaffRole[] {
  return STAFF_ROLES.filter((r) =>
    'permission' in rule
      ? roleHasStaffPermission(r, rule.permission)
      : hasAtLeastRole(r, rule.minRole)
  );
}

/**
 * Règle d'un onglet de la Diffusion : sa permission, sinon son rôle minimum,
 * sinon tout le staff (c'était le sens de « permission absente »).
 */
export function diffusionTabAccess(tab: {
  permission?: string;
  minRole?: StaffRole;
}): AccessRule {
  if (tab.permission) return { permission: tab.permission as StaffPermission };
  return tab.minRole ? { minRole: tab.minRole } : ANY_STAFF;
}
