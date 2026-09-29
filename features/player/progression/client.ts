// features/player/progression/client.ts — appel typé de la carte
// « Progression » (lot P5). L'URL vit ici ; la portée sujet + équipe est posée
// par `playerRequest` (la route est `subject: 'follow'` et lit `?teamId=`).

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type { ProgressionResponse } from './schemas';

export const progressionUrls = {
  get: '/api/player/progression',
};

export const progressionClient = {
  /** Sans redirection sur 401 : une carte n'arrache pas toute la page. */
  get: (scope: PlayerScope) =>
    playerRequest<ProgressionResponse>(progressionUrls.get, {
      scope,
      skipAuthRedirect: true,
    }),
};
