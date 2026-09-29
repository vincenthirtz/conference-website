// features/admin/tournaments/hooks/useTournamentPool.ts — répartition de la
// liste d'attente d'un tournoi regroupé (pages/admin/tournament/[id]/pool),
// lot L10.
//
// Chaque geste renvoie la vue à jour : elle remplace le cache, sans relecture.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminPoolView } from '@/pages/api/admin/tournament/[id]/pool';
import { adminRequest } from '@/utils/admin/adminHttp';
import { tournamentsClient, tournamentUrls } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export type PoolAction =
  | { action: 'place'; entryIds: string[]; teamId: string }
  | { action: 'place-new'; entryIds: string[]; teamName: string }
  | { action: 'unplace'; entryId: string };

const poolKey = (id: string) => tournamentKeys.part(id, 'pool');

export function useTournamentPool(id: string) {
  return useQuery({
    queryKey: poolKey(id),
    queryFn: () => tournamentsClient.pool(id),
    enabled: !!id,
    ...MOUNT_ONLY,
  });
}

export function useTournamentPoolAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PoolAction) =>
      adminRequest<AdminPoolView>(tournamentUrls.pool(id), {
        method: 'POST',
        json: body,
      }),
    onSuccess: (next) => qc.setQueryData(poolKey(id), next),
  });
}
