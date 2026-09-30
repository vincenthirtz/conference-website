// features/admin/staff-planning/hooks/useStaffPlanning.ts — créneaux de la
// grille affichée (6 semaines autour du mois) et pseudos connus.

import { useQuery } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { staffPlanningClient as client } from '../client';

export const staffPlanningKeys = {
  all: adminKey('staff-planning'),
  window: (from: string, to: string) => adminKey('staff-planning', from, to),
};

export function useStaffPlanning(from: string, to: string) {
  return useQuery({
    queryKey: staffPlanningKeys.window(from, to),
    queryFn: () => client.list(from, to),
    placeholderData: (prev) => prev,
  });
}
