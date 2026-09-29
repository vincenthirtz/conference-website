// features/player/progression/hooks/useProgression.ts — lecture de la carte
// « Progression » sur le cache joueuse (lot P5).
//
// Même comportement qu'avant : une erreur est journalisée et la carte reste
// masquée (pas d'écran d'erreur pour une carte de confort).

import { useQuery } from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { progressionClient } from '../client';

export const progressionKeys = {
  detail: (scope: PlayerScope) => playerKey(scope, 'progression'),
};

export function useProgression() {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: progressionKeys.detail(scope),
    queryFn: async () => {
      try {
        return await progressionClient.get(scope);
      } catch (err) {
        logger.error('[ProgressionCard] load error', err);
        throw err;
      }
    },
    ...PLAYER_QUERY_OPTIONS,
  });
}
