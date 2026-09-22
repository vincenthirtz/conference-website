// utils/staffRoles.ts
//
// La partie PURE des rôles staff : constantes, libellés, hiérarchie, classes
// d'erreur. Aucun import serveur, exprès.
//
// Elle vivait dans `utils/staff.ts`, qui importe `supabaseAdmin` pour ses
// gardes. La navbar n'y prenait que `hasAtLeastRole`, mais `utils/supabase.ts`
// crée ses clients au chargement du module : le tree-shaking ne peut pas
// l'éliminer, et tout le client serveur (+ le polyfill `buffer`) partait dans
// `_app`, donc dans CHAQUE page. Le code client importe d'ici ; `staff.ts`
// réexporte tout, pour que le code serveur n'ait pas à changer d'import.

import type { StaffRole } from '@/types/admin';

export type { StaffRole } from '@/types/admin';

/* -----------------------------------------------------------
 * Types & constantes
 * ---------------------------------------------------------*/

export class StaffUnauthorizedError extends Error {
  statusCode = 403;
  constructor(message = 'Accès staff non autorisé') {
    super(message);
    this.name = 'StaffUnauthorizedError';
  }
}

export class StaffUnauthenticatedError extends Error {
  statusCode = 401;
  constructor(message = 'Utilisateur non authentifié') {
    super(message);
    this.name = 'StaffUnauthenticatedError';
  }
}

export const STAFF_ROLES: StaffRole[] = [
  'owner',
  'admin',
  'caster',
  'referee',
  'helper',
];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  caster: 'Caster',
  referee: 'Arbitre',
  helper: 'Bénévole',
};

export const STAFF_ROLE_DESCRIPTION: Record<StaffRole, string> = {
  owner: 'Accès complet, gestion du staff, gestion des permissions',
  admin: 'Accès complet au back-office, gestion tournois & résultats',
  caster: 'Accès lecture + meta info match (pour préparation cast)',
  referee: 'Le jour J, sur les matchs : check-in, scores, litiges',
  helper: 'Une seule tâche : tenir le check-in',
};

/**
 * Hiérarchie HISTORIQUE, conservée telle quelle pour les ~68 gardes existantes
 * (`withStaffPage('admin')`, `withStaffRoute(h, 'caster')`…).
 *
 * Les rôles du lot A2 sont volontairement SOUS `caster` (rang négatif) : un
 * ordre total ne sait pas exprimer « peut arbitrer mais pas caster ». Leur
 * accès passe donc exclusivement par les permissions
 * (`utils/staffPermissions.ts`), jamais par ce rang — dont le seul rôle ici est
 * de garantir qu'aucune garde héritée ne les laisse entrer par erreur.
 */
export const STAFF_ROLE_RANK: Record<StaffRole, number> = {
  owner: 2,
  admin: 1,
  caster: 0,
  referee: -1,
  helper: -1,
};

/* -----------------------------------------------------------
 * Helpers de base sur les rôles
 * ---------------------------------------------------------*/

export function formatStaffRoleLabel(role: StaffRole): string {
  return STAFF_ROLE_LABEL[role] ?? role;
}

export function getRoleLabel(role: StaffRole | null | undefined): string {
  if (!role) return '—';
  return STAFF_ROLE_LABEL[role] ?? role;
}

export function getRoleDescription(role: StaffRole | null | undefined): string {
  if (!role) return '';
  return STAFF_ROLE_DESCRIPTION[role] ?? '';
}

export function getRoleOptions() {
  return STAFF_ROLES.map((role) => ({
    value: role,
    label: STAFF_ROLE_LABEL[role],
    description: STAFF_ROLE_DESCRIPTION[role],
  }));
}

export function hasAtLeastRole(
  role: StaffRole | null | undefined,
  minRole: StaffRole
): boolean {
  if (!role) return false;
  return STAFF_ROLE_RANK[role] >= STAFF_ROLE_RANK[minRole];
}
