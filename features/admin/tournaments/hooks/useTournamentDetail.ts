// features/admin/tournaments/hooks/useTournamentDetail.ts — fiche d'un
// tournoi (`GET/PATCH /api/admin/tournament/[id]`), partagée par le hub,
// l'édition, les outils, les matchs et les panneaux qui n'en lisent qu'un
// champ (fuseau, jeu) : une seule requête pour tous (lot L10).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminRequest } from '@/utils/admin/adminHttp';
import { tournamentUrls } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

/**
 * Réponse de la fiche : `tournament` porte toutes les colonnes ; chaque écran
 * la lit sous le type qui le concerne (`T`).
 */
export type TournamentDetailResponse<T = Record<string, unknown>> = {
  tournament?: T;
};

export const fetchTournamentDetail = <T>(id: string) =>
  adminRequest<TournamentDetailResponse<T>>(tournamentUrls.byId(id));

export function useTournamentDetail<T = Record<string, unknown>>(
  id: string,
  options: { enabled?: boolean; editor?: boolean } = {}
) {
  return useQuery({
    queryKey: tournamentKeys.detail(id),
    queryFn: () => fetchTournamentDetail<T>(id),
    enabled: !!id && options.enabled !== false,
    ...MOUNT_ONLY,
    // Fiche éditée : relue à chaque ouverture, jamais servie d'un vieux cache.
    ...(options.editor ? { staleTime: 0, gcTime: 0 } : {}),
  });
}

/**
 * PATCH (défaut) ou PUT (formulaire d'édition complet) de la fiche ; tout ce
 * qui dépend du tournoi est relu ensuite.
 */
export function useUpdateTournament<T = Record<string, unknown>>(
  id: string,
  method: 'PATCH' | 'PUT' = 'PATCH'
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      adminRequest<TournamentDetailResponse<T>>(tournamentUrls.byId(id), {
        method,
        json: patch,
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: tournamentKeys.one(id) }),
  });
}
