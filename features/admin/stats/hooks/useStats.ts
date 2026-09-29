// features/admin/stats/hooks/useStats.ts — tableaux de statistiques paginés
// côté serveur. La page précédente reste affichée pendant le chargement de
// la suivante (comme l'ancien état local, jamais vidé avant la réponse).
// Pas de relecture au retour sur l'onglet : le tableau se grise pendant un
// chargement, ce que l'ancien écran ne faisait qu'à la demande.

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { statsClient } from '../client';

export const statsKeys = {
  all: adminKey('stats'),
  teams: (query: string) => [...statsKeys.all, 'teams', query] as const,
  maps: (query: string) => [...statsKeys.all, 'maps', query] as const,
};

export function useTeamStats<R>(query: string | null) {
  return useQuery({
    queryKey: statsKeys.teams(query ?? ''),
    queryFn: () => statsClient.teams<R>(query ?? ''),
    enabled: query !== null,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useMapStats<R>(query: string | null) {
  return useQuery({
    queryKey: statsKeys.maps(query ?? ''),
    queryFn: () => statsClient.maps<R>(query ?? ''),
    enabled: query !== null,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}
