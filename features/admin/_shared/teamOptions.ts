// features/admin/_shared/teamOptions.ts — équipes actives pour les sélecteurs
// des modales admin (scrims, grilles de scrim…), en cache partagé : deux
// modales qui les proposent ne les chargent qu'une fois.

import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/utils/admin/adminHttp';
import { adminKey } from './query';

export type TeamOption = {
  id: string;
  name: string;
  short_name: string | null;
};

export const activeTeamOptionsKey = adminKey('teams', 'options', 'active');

export const fetchActiveTeamOptions = () =>
  adminRequest<{ teams?: TeamOption[] }>(
    '/api/admin/teams?limit=200&isActive=true'
  );

/**
 * `enabled` : ne rien charger avant la première ouverture de la modale. Une
 * lecture en échec est retentée à la réouverture suivante.
 */
export function useActiveTeamOptions(enabled: boolean) {
  return useQuery({
    queryKey: activeTeamOptionsKey,
    queryFn: fetchActiveTeamOptions,
    enabled,
    refetchOnWindowFocus: false,
  });
}
