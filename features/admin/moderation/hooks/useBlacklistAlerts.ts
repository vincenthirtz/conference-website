// features/admin/moderation/hooks/useBlacklistAlerts.ts — historique des
// détections blacklist, paginé par curseur (« Charger plus »).

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey } from '../../_shared/query';
import { moderationClient } from '../client';

export const blacklistAlertsKeys = {
  all: adminKey('blacklist-alerts'),
  list: (filters: { strength: string; source: string }) =>
    [...blacklistAlertsKeys.all, filters] as const,
};

export function useBlacklistAlerts<A>(opts: {
  pageSize: number;
  strength: string;
  source: string;
}) {
  const { pageSize, strength, source } = opts;
  const qc = useQueryClient();
  const queryKey = blacklistAlertsKeys.list({ strength, source });
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      if (pageParam) params.set('before', pageParam);
      if (strength) params.set('strength', strength);
      if (source) params.set('source', source);
      return moderationClient.blacklistAlerts<A>(params.toString());
    },
    getNextPageParam: (last) => last.nextCursor ?? null,
    // Liste masquée pendant un rechargement : pas de relecture au focus.
    refetchOnWindowFocus: false,
  });

  /** « Actualiser » : repart de la première page, comme l'ancien écran. */
  const reload = useCallback(
    () =>
      qc.resetQueries({
        queryKey: blacklistAlertsKeys.list({ strength, source }),
      }),
    [qc, strength, source]
  );

  return { query, reload };
}
