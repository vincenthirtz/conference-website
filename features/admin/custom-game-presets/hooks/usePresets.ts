// features/admin/custom-game-presets/hooks/usePresets.ts — presets d'un jeu
// et phases du tournoi choisi dans la modale.

import { useQuery } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { presetsClient as client } from '../client';

export const presetsKeys = {
  game: (game: string) => adminKey('custom-game-presets', game),
  stages: (tournamentId: string) =>
    adminKey('custom-game-presets', 'stages', tournamentId),
};

export function usePresets(game: string | null | undefined) {
  return useQuery({
    queryKey: presetsKeys.game(game ?? ''),
    queryFn: async () => (await client.list(game as string)).presets ?? [],
    enabled: !!game,
    // La liste se masque pendant une lecture : pas de relecture au focus.
    refetchOnWindowFocus: false,
  });
}

/** Échec silencieux (liste vide), comme avant. */
export function usePresetTournamentStages(tournamentId: string) {
  return useQuery({
    queryKey: presetsKeys.stages(tournamentId),
    queryFn: async () =>
      (await client.tournamentStages(tournamentId)).stages ?? [],
    enabled: !!tournamentId,
    retry: false,
  });
}
