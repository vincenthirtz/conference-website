// features/admin/map-pool/hooks/useMapPool.ts — cartes d'un jeu.

import { useQuery } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { mapPoolClient as client } from '../client';

export const mapPoolKeys = {
  game: (game: string) => adminKey('map-pool', game),
};

export function useMapPool(game: string | null | undefined) {
  return useQuery({
    queryKey: mapPoolKeys.game(game ?? ''),
    queryFn: async () => (await client.list(game as string)).maps ?? [],
    enabled: !!game,
    // La liste se masque pendant une lecture : pas de relecture au focus.
    refetchOnWindowFocus: false,
  });
}
