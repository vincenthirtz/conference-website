// features/admin/ratings/client.ts — appels typés de l'écran rating (L10).
//
// Le recalcul reste envoyé par `useIdempotentMutation` (file hors ligne) :
// on n'expose ici que son chemin, pour qu'aucune URL ne soit écrite en dur
// dans la page.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { LeaderboardResponse } from '@/types/rating';
import type { RatingCoverageResponse } from './schemas';

export type RatingsRebuildResult = { players: number; matches: number };

export const ratingsPaths = {
  coverage: '/api/admin/ratings/coverage',
  rebuild: '/api/admin/ratings/rebuild',
  // Route publique, lue avec la session staff comme avant.
  leaderboardTop: '/api/players/leaderboard?limit=10',
} as const;

export const ratingsClient = {
  coverage: () => adminRequest<RatingCoverageResponse>(ratingsPaths.coverage),
  leaderboardTop: () =>
    adminRequest<LeaderboardResponse>(ratingsPaths.leaderboardTop),
};
