// features/admin/ratings/hooks/useRatings.ts — couverture et top du
// classement, en cache partagé ; le recalcul invalide les deux.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey } from '../../_shared/query';
import { ratingsClient } from '../client';

export const ratingsKeys = {
  all: adminKey('ratings'),
  coverage: () => [...ratingsKeys.all, 'coverage'] as const,
  leaderboardTop: () => [...ratingsKeys.all, 'leaderboard-top'] as const,
};

export function useRatingCoverage() {
  return useQuery({
    queryKey: ratingsKeys.coverage(),
    queryFn: ratingsClient.coverage,
  });
}

export function useLeaderboardTop() {
  return useQuery({
    queryKey: ratingsKeys.leaderboardTop(),
    queryFn: ratingsClient.leaderboardTop,
  });
}

/** Recharge couverture + classement (après un recalcul). */
export function useRefreshRatings() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: ratingsKeys.all }),
    [qc]
  );
}
