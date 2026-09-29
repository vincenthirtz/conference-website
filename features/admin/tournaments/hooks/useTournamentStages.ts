// features/admin/tournaments/hooks/useTournamentStages.ts — phases d'un
// tournoi (liste, réordonnancement), lot L10. Clé partagée par la liste des
// phases, le hub et les fiches de phase (phases sœurs).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StageSummary } from '@/types/admin';
import { adminRequest } from '@/utils/admin/adminHttp';
import { tournamentUrls } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export const tournamentStagesKey = (id: string) =>
  tournamentKeys.part(id, 'stages');

export const fetchTournamentStages = <S = StageSummary>(id: string) =>
  adminRequest<{ stages?: S[] }>(tournamentUrls.stages(id));

export function useTournamentStages(id: string) {
  return useQuery({
    queryKey: tournamentStagesKey(id),
    queryFn: async () => (await fetchTournamentStages(id)).stages || [],
    enabled: !!id,
    ...MOUNT_ONLY,
  });
}

/** Nouvel ordre des phases ; la réponse remplace la liste en cache. */
export function useReorderTournamentStages(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stages: { id: string; order_index: number }[]) =>
      adminRequest<{ stages?: StageSummary[] }>(tournamentUrls.stages(id), {
        method: 'PATCH',
        json: { stages },
      }),
    onSuccess: (json) =>
      qc.setQueryData(tournamentStagesKey(id), json.stages || []),
  });
}
