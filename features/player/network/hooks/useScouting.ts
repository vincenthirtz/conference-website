// features/player/network/hooks/useScouting.ts — dossier d'adversaire sur le
// cache joueuse (lot P15).
//
// Clé `playerKey(scope, …)` : changer d'équipe active (sélecteur) relit le
// dossier — il se calcule du point de vue de NOTRE équipe. L'appel porte
// l'équipe active et jamais le sujet (`networkClient.scouting`).

import { useQuery } from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { networkClient } from '../client';

export function useScoutingReport(targetTeamId: string | null) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: playerKey(scope, 'network', 'scouting', targetTeamId),
    enabled: Boolean(targetTeamId),
    queryFn: async () => {
      try {
        return await networkClient.scouting(scope, targetTeamId as string);
      } catch (err) {
        logger.error('[scouting] load error', err);
        throw err;
      }
    },
    ...PLAYER_QUERY_OPTIONS,
  });
}
