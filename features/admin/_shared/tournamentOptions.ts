// features/admin/_shared/tournamentOptions.ts — liste courte des tournois pour
// les filtres « tournoi » des écrans admin (statistiques, litiges…), en cache
// partagé : deux écrans qui l'affichent ne la chargent qu'une fois.

import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/utils/admin/adminHttp';
import { adminKey } from './query';

export type TournamentOption = {
  id: string;
  name: string;
  slug: string | null;
};

export type TournamentOptionsResponse = {
  tournaments: TournamentOption[];
  total: number | null;
};

export const tournamentOptionsKey = adminKey('tournaments', 'options');

export const fetchTournamentOptions = () =>
  adminRequest<TournamentOptionsResponse>('/api/admin/tournaments?limit=200');

/** `enabled` : ne charger qu'à l'ouverture d'un formulaire, par exemple. */
export function useTournamentOptions(enabled = true) {
  return useQuery({
    queryKey: tournamentOptionsKey,
    queryFn: fetchTournamentOptions,
    enabled,
  });
}
