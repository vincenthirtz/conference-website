// lib/staffRoles.ts
// Source de vérité pour les rôles staff du site OW Women's Cup

export type StaffRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'caster';

/* -----------------------------------------------------------
 * Liste des rôles disponibles
 * ---------------------------------------------------------*/

export const STAFF_ROLES: StaffRole[] = [
  'owner',
  'admin',
  'manager',
  'caster',
];

/* -----------------------------------------------------------
 * Labels publics (affichage UI)
 * ---------------------------------------------------------*/

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  caster: 'Caster',
};

/* -----------------------------------------------------------
 * Description (pour tooltips, settings admin)
 * ---------------------------------------------------------*/

export const STAFF_ROLE_DESCRIPTION: Record<StaffRole, string> = {
  owner: 'Accès complet, gestion du staff, gestion des permissions',
  admin: 'Accès complet au back-office, gestion tournois & résultats',
  manager: 'Gestion opérationnelle : équipes, demandes, matches',
  caster: 'Accès lecture + meta info match (pour préparation cast)',
};

/* -----------------------------------------------------------
 * Hiérarchie — utilisé pour check permissions rapidement
 *
 * owner (3)
 * admin (2)
 * manager (1)
 * caster (0)
 * ---------------------------------------------------------*/

export const STAFF_ROLE_RANK: Record<StaffRole, number> = {
  owner: 3,
  admin: 2,
  manager: 1,
  caster: 0,
};

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

export function getRoleLabel(role: StaffRole | null | undefined): string {
  if (!role) return '—';
  return STAFF_ROLE_LABEL[role] ?? role;
}

export function getRoleDescription(role: StaffRole | null | undefined): string {
  if (!role) return '';
  return STAFF_ROLE_DESCRIPTION[role] ?? '';
}

export function hasAtLeastRole(
  current: StaffRole | null | undefined,
  minRole: StaffRole
): boolean {
  if (!current) return false;
  return STAFF_ROLE_RANK[current] >= STAFF_ROLE_RANK[minRole];
}

/**
 * Vérifie si le rôle du staff appartient au staff (caster+)
 */
export function isStaff(role: StaffRole | null | undefined): boolean {
  return !!role;
}

/**
 * Vérifie si rôle >= admin
 */
export function isAdmin(role: StaffRole | null | undefined): boolean {
  return hasAtLeastRole(role, 'admin');
}

/**
 * Vérifie si rôle >= manager
 */
export function isManager(role: StaffRole | null | undefined): boolean {
  return hasAtLeastRole(role, 'manager');
}

/**
 * Génère la liste exploitable pour un <select>
 */
export function getRoleOptions() {
  return STAFF_ROLES.map((role) => ({
    value: role,
    label: STAFF_ROLE_LABEL[role],
    description: STAFF_ROLE_DESCRIPTION[role],
  }));
}
