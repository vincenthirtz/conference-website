// features/player/predictions/client.ts — appels typés des pronostics
// (lot P12). Routes `subject: 'self'` : jamais de portée `?as=` (les
// pronostics sont ceux de la personne connectée, même sous l'admin).
// Écritures idempotentes (`Idempotency-Key` par geste) : un double tap ne
// pose qu'une écriture.

import { playerRequest } from '@/utils/player/playerHttp';
import type {
  MatchPredictionState,
  PlayerPredictionsResponse,
  PredictionLeaderboardResponse,
  PredictionSaved,
} from './schemas';

export const predictionsUrls = {
  list: '/api/player/predictions',
  leaderboard: '/api/player/predictions/leaderboard',
  match: (matchId: string) =>
    `/api/player/predictions/${encodeURIComponent(matchId)}`,
};

export const predictionsClient = {
  list: () => playerRequest<PlayerPredictionsResponse>(predictionsUrls.list),
  leaderboard: () =>
    playerRequest<PredictionLeaderboardResponse>(predictionsUrls.leaderboard),
  setLeaderboardVisibility: (showInLeaderboard: boolean) =>
    playerRequest<{ showsMyName: boolean }>(predictionsUrls.leaderboard, {
      method: 'PUT',
      json: { showInLeaderboard },
      idempotent: true,
    }),
  /** `skipAuthRedirect` : la carte de match vit aussi sur une page publique. */
  match: (matchId: string, opts: { skipAuthRedirect?: boolean } = {}) =>
    playerRequest<MatchPredictionState>(predictionsUrls.match(matchId), opts),
  pick: (
    matchId: string,
    teamId: string,
    opts: { skipAuthRedirect?: boolean } = {}
  ) =>
    playerRequest<PredictionSaved>(predictionsUrls.match(matchId), {
      method: 'PUT',
      json: { teamId },
      idempotent: true,
      ...opts,
    }),
  remove: (matchId: string, opts: { skipAuthRedirect?: boolean } = {}) =>
    playerRequest<{ ok: true }>(predictionsUrls.match(matchId), {
      method: 'DELETE',
      idempotent: true,
      ...opts,
    }),
};
