// features/admin/tournaments/hooks/useTournamentHistory.ts — journal staff
// d'un tournoi (pages/admin/tournament/[id]/history), lot L10.
//
// L'écran lisait par `fetch()` nu : il passe par `adminRequest` (jeton).

import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/utils/admin/adminHttp';
import { tournamentUrls, withFallback } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export type TournamentHistoryFilters = {
  limit: number;
  entityType: string;
  action: string;
};

/** `L` : forme d'une ligne de journal, telle que l'écran l'affiche. */
export function useTournamentHistory<L>(
  id: string,
  filters: TournamentHistoryFilters,
  loadError: string
) {
  return useQuery({
    queryKey: tournamentKeys.part(id, 'history', filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(filters.limit));
      if (filters.entityType) params.set('entityType', filters.entityType);
      if (filters.action) params.set('action', filters.action);
      const json = await withFallback(
        adminRequest<{ logs?: L[] }>(tournamentUrls.history(id, params)),
        loadError
      );
      return json.logs || [];
    },
    enabled: !!id,
    ...MOUNT_ONLY,
  });
}
