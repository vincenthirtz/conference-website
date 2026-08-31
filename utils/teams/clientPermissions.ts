// utils/teams/clientPermissions.ts
//
// Lecture CLIENT des permissions d'équipe renvoyées par l'API
// (`/api/player/dashboard`, `/api/admin/teams/my` → `permissions`).
//
// Pourquoi un helper plutôt qu'un `payload.permissions.includes(...)` en ligne :
//
//  1. **Le repli legacy est une décision, pas un détail.** Une réponse sans le
//     champ (client déployé avant le serveur, payload en cache, fixture de
//     test) doit se comporter comme AVANT — droits de gestion complets dès que
//     `isCaptain || isManager`. Le contraire masquerait des boutons à des
//     capitaines sur la foi d'un champ absent. Un tableau VIDE, lui, est une
//     réponse explicite : aucune permission.
//  2. **Un seul endroit sait lire la forme brute** : les écrans manipulent un
//     prédicat, jamais le tableau.
//
// La liste vient du serveur (`TeamManagementAccess.permissions`) : c'est la
// MÊME que celle appliquée par les routes d'écriture. Ce module ne DÉCIDE
// jamais de droits — il ne fait que refléter côté UI ce que le serveur
// appliquera de toute façon.

import {
  TEAM_PERMISSION_VALUES,
  isTeamPermission,
  type TeamPermission,
} from '@/utils/teamRoles';

/** Ce que les payloads API exposent de l'accès de l'appelant à son équipe. */
export type TeamAccessPayload = {
  permissions?: unknown;
  isCaptain?: boolean | null;
  isManager?: boolean | null;
};

/**
 * Permissions effectives lisibles depuis un payload API.
 *
 * - tableau présent → filtré sur le catalogue connu, ordre canonique ;
 * - champ absent → repli legacy (cf. en-tête) : tout si l'appelant gère
 *   l'équipe, rien sinon.
 */
export function readTeamPermissions(
  payload: TeamAccessPayload | null | undefined
): TeamPermission[] {
  const raw = payload?.permissions;
  if (Array.isArray(raw)) {
    const seen = new Set<TeamPermission>();
    for (const value of raw) {
      if (isTeamPermission(value)) seen.add(value);
    }
    return TEAM_PERMISSION_VALUES.filter((p) => seen.has(p));
  }
  const canManage = !!payload?.isCaptain || !!payload?.isManager;
  return canManage ? [...TEAM_PERMISSION_VALUES] : [];
}

/**
 * Prédicat prêt à l'emploi pour les écrans : `can('manage_roster')`.
 *
 * `readOnly` (inspection staff) répond `false` à tout : l'écran affiche alors
 * une photo fidèle, sans aucun geste — c'est la règle déjà portée par
 * `PlayerAreaContext`, on la garde ici pour que les écrans n'aient qu'UN
 * booléen à consulter au lieu de deux.
 */
export function makeTeamPermissionCheck(
  permissions: TeamPermission[],
  options: { readOnly?: boolean } = {}
): (permission: TeamPermission) => boolean {
  if (options.readOnly) return () => false;
  const set = new Set(permissions);
  return (permission) => set.has(permission);
}
