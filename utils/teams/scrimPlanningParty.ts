// utils/teams/scrimPlanningParty.ts
// Résout la « partie » (team1 / team2 / staff) d'un utilisateur sur une session
// de planning donnée, côté espace joueur/capitaine (Bearer auth).
//
// Règle : l'appartenance à une équipe de la session PRIME sur le statut staff
// (un caster qui gère aussi team1 peint en tant que team1). Un utilisateur qui
// ne gère aucune des deux équipes et n'est pas staff → null (403 côté route).

import { getManagedTeams, accessHasPermission } from './managementAccess';
import { getStaffRole } from '@/utils/staff';
import type { PlanningParty } from './scrimPlanningOverlap';

type PlanningTeams = { team1_id: string; team2_id: string };

/**
 * @returns 'team1' | 'team2' | 'staff' selon le rôle du user sur la session,
 *          ou `null` s'il n'a aucun droit (ni équipe, ni staff).
 */
export async function resolvePlanningParty(
  userId: string,
  planning: PlanningTeams,
  tenantId: string
): Promise<PlanningParty | null> {
  // Permission fine (R2) : peindre/valider des créneaux relève de
  // `manage_scrims`. Un rôle d'équipe sans cette permission ne parle pas au nom
  // de l'équipe sur une grille — même s'il gère le roster par ailleurs.
  //
  // On balaie TOUTES les équipes gérées (un manager peut en encadrer
  // plusieurs) : la partie se déduit de la session, pas d'un `?teamId=`, et
  // c'est plus juste ainsi — un manager des deux équipes de la session n'a
  // aucune raison de dépendre de l'écran d'où il vient. `team1` l'emporte
  // alors, par l'ordre d'évaluation, et c'est déterministe.
  const managedTeams = await getManagedTeams(userId, tenantId);
  const canScrim = managedTeams.filter((a) =>
    accessHasPermission(a, 'manage_scrims')
  );
  if (canScrim.some((a) => a.teamId === planning.team1_id)) return 'team1';
  if (canScrim.some((a) => a.teamId === planning.team2_id)) return 'team2';

  const role = await getStaffRole(userId);
  if (role) return 'staff';

  return null;
}
