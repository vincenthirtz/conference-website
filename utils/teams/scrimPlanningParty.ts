// utils/teams/scrimPlanningParty.ts
// Résout la « partie » (team1 / team2 / staff) d'un utilisateur sur une session
// de planning donnée, côté espace joueur/capitaine (Bearer auth).
//
// Règle : l'appartenance à une équipe de la session PRIME sur le statut staff
// (un caster qui gère aussi team1 peint en tant que team1). Un utilisateur qui
// ne gère aucune des deux équipes et n'est pas staff → null (403 côté route).

import { getManagedTeam } from './managementAccess';
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
  const managed = await getManagedTeam(userId, tenantId);
  if (managed?.teamId === planning.team1_id) return 'team1';
  if (managed?.teamId === planning.team2_id) return 'team2';

  const role = await getStaffRole(userId);
  if (role) return 'staff';

  return null;
}
