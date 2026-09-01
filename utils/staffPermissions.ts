// utils/staffPermissions.ts
//
// Permissions STAFF fines — lot A2 de docs/PLAN-espace-admin.md.
//
// Le staff n'avait que trois rôles (`owner | admin | caster`) et 63 pages
// gatées `withStaffPage('admin')`. Conséquence : accueillir quelqu'un pour une
// tâche — tenir le check-in un samedi — imposait de lui donner les mêmes droits
// que l'administrateur du site (suppression d'équipes, réglages, facturation,
// secrets bot). Avec 9 comptes staff dont 4 owners, ce n'était pas un risque
// théorique : c'était la seule façon d'accueillir un renfort.
//
// C'est EXACTEMENT le problème résolu côté équipes le 2026-08-31
// (`utils/teamRoles.ts` + `assertTeamPermission`) : un booléen « c'est un
// manager » masquait huit droits distincts. Ce module copie délibérément ce
// modèle — même vocabulaire, même forme, mêmes tests — plutôt que d'en inventer
// un second.
//
// Ce que ce module NE fait PAS : décider de l'accès. Il ne fait que dire ce
// qu'un rôle couvre ; les gardes restent dans `utils/staff.ts`
// (`requireStaffPermissionFromRequest`, `withStaffRoute`, `withStaffPage`).

import type { StaffRole } from '@/types/admin';

export const STAFF_PERMISSION_CATALOG = [
  {
    value: 'run_checkin',
    label: 'Tenir le check-in',
    description:
      'Suivre les check-ins du jour, relancer les équipes, déclencher le processeur',
  },
  {
    value: 'arbitrate_matches',
    label: 'Arbitrer les matchs',
    description: 'Saisir un score, trancher un litige, prononcer un forfait',
  },
  {
    value: 'moderate_support',
    label: 'Modérer le support',
    description: 'Traiter les signalements et les tickets',
  },
  {
    value: 'manage_teams',
    label: 'Gérer les équipes',
    description: 'Créer, éditer, fusionner ou supprimer une équipe',
  },
  {
    value: 'manage_tournaments',
    label: 'Gérer les tournois',
    description: 'Créer et configurer tournois, phases et brackets',
  },
  {
    value: 'manage_communications',
    label: 'Communiquer',
    description: 'Actualités, campagnes email, annonces Discord',
  },
  {
    value: 'manage_broadcast',
    label: 'Régie et diffusion',
    description:
      'Run of show, tops (cues), vagues, stations, overlays — la conduite du direct',
  },
  {
    value: 'use_cast_cockpit',
    label: 'Cockpit de cast',
    description:
      'Consulter les infos de match nécessaires à la préparation d’un cast',
  },
  {
    value: 'manage_settings',
    label: 'Réglages du site',
    description: 'Paramètres, rôles d’équipe, intégrations, secrets',
  },
  {
    value: 'manage_staff',
    label: 'Gérer le staff',
    description: 'Ajouter, retirer et changer le rôle des membres du staff',
  },
  {
    value: 'manage_billing',
    label: 'Facturation',
    description: 'Abonnement, plan, factures',
  },
  {
    value: 'manage_tasks',
    label: 'Tableau de tâches',
    description: 'Kanban interne du staff : cartes, colonnes, assignations',
  },
  {
    value: 'manage_tenant',
    label: 'Administrer l’organisation',
    description:
      'Secrets du tenant, plan et paiement, demandes de tenant, admins de pôle',
  },
] as const;

export type StaffPermission =
  (typeof STAFF_PERMISSION_CATALOG)[number]['value'];

export const STAFF_PERMISSION_VALUES: StaffPermission[] =
  STAFF_PERMISSION_CATALOG.map((p) => p.value);

const STAFF_PERMISSION_SET = new Set<string>(STAFF_PERMISSION_VALUES);

export function isStaffPermission(value: unknown): value is StaffPermission {
  return typeof value === 'string' && STAFF_PERMISSION_SET.has(value);
}

/**
 * Ce que chaque rôle couvre.
 *
 * Les trois rôles historiques gardent EXACTEMENT leur périmètre actuel — un
 * `owner` a tout, un `admin` a tout sauf ce qui engage l'organisation
 * (facturation) et ce qui redistribue le pouvoir (staff), un `caster` a la
 * régie. Sans cette égalité, la migration ne serait pas une migration mais une
 * refonte des droits, faite en même temps qu'un changement de mécanique.
 *
 * Les deux rôles NOUVEAUX sont la raison d'être du lot : accueillir quelqu'un
 * pour une tâche, sans lui donner le site.
 */
export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, StaffPermission[]> = {
  owner: [...STAFF_PERMISSION_VALUES],
  // `admin` a TOUT sauf ce qui est réellement réservé au propriétaire
  // aujourd'hui : les 7 routes gatées `owner` (secrets du tenant, plan et
  // paiement, demandes de tenant, admins de pôle).
  //
  // Correction du 2026-09-01, pendant la migration page par page : la première
  // version retirait aussi `manage_staff` et `manage_billing` à l'admin. C'était
  // FAUX — `/admin/users/manage` et `/admin/billing` sont gatées `admin`
  // aujourd'hui, et le lot A2 s'interdit de changer le périmètre des rôles
  // historiques. Aucune page n'avait encore été migrée sur ces deux
  // permissions, donc aucun droit n'a bougé entre-temps.
  admin: STAFF_PERMISSION_VALUES.filter((p) => p !== 'manage_tenant'),
  // Le caster garde EXACTEMENT ce qu'il avait : les cinq pages et vingt-deux
  // routes déjà gatées `'caster'`, pas la conduite de la régie
  // (`manage_broadcast`), qui était et reste réservée à l'admin.
  //
  // Correction du 2026-09-01, pendant la migration : lui donner
  // `manage_broadcast` lui ouvrait les tops, vagues et présences de la régie —
  // un élargissement que trois tests ont attrapé, et que ce lot s'interdit.
  caster: ['use_cast_cockpit'],
  /** Arbitre : le jour J, sur les matchs. Ni équipes, ni réglages. */
  referee: ['run_checkin', 'arbitrate_matches'],
  /** Bénévole : la porte d'entrée. Une tâche, une seule. */
  helper: ['run_checkin'],
};

/** Permissions effectives d'un rôle (liste vide pour un rôle inconnu). */
export function staffPermissionsFor(
  role: StaffRole | null | undefined
): StaffPermission[] {
  if (!role) return [];
  return STAFF_ROLE_PERMISSIONS[role] ?? [];
}

/** `true` si le rôle couvre la permission. */
export function roleHasStaffPermission(
  role: StaffRole | null | undefined,
  permission: StaffPermission
): boolean {
  return staffPermissionsFor(role).includes(permission);
}
