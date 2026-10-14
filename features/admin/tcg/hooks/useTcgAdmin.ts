// features/admin/tcg/hooks/useTcgAdmin.ts — lectures des panneaux de
// /admin/tcg hors files de modération (vue d'ensemble, catalogue,
// engagement, historique des gains, association, cadeau de bienvenue,
// rattrapage Battle.net).
//
// Pas de relecture au retour sur l'onglet : ces panneaux se relisaient à
// l'ouverture et après chaque geste (inchangé). Le jeton d'overlay n'est PAS
// ici : il reste hors cache (cf. client.ts).

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey } from '../../_shared/query';
import { tcgAdminClient as client } from '../client';

const NO_FOCUS = { refetchOnWindowFocus: false } as const;

export const tcgAdminKeys = {
  overview: adminKey('tcg', 'overview'),
  catalogue: (userId: string | null) =>
    adminKey('tcg', 'catalogue', userId ?? ''),
  engagement: (weeks: number) => adminKey('tcg', 'engagement', weeks),
  packHistory: (source: string) => adminKey('tcg', 'pack-history', source),
  association: adminKey('tcg', 'association'),
  welcomeGift: adminKey('tcg', 'welcome-gift'),
  battlenetBackfill: adminKey('tcg', 'battlenet-backfill'),
};

/** Réponse brute : l'écran la normalise. */
export function useTcgOverviewRaw() {
  return useQuery({
    queryKey: tcgAdminKeys.overview,
    queryFn: client.overview,
    ...NO_FOCUS,
  });
}

export function useTcgCatalogue<T>(userId: string | null) {
  return useQuery({
    queryKey: tcgAdminKeys.catalogue(userId),
    queryFn: () => client.catalogue<T>(userId),
    ...NO_FOCUS,
  });
}

export function useTcgEngagement<T>(weeks: number) {
  return useQuery({
    queryKey: tcgAdminKeys.engagement(weeks),
    queryFn: () => client.engagement<T>(weeks),
    ...NO_FOCUS,
  });
}

/**
 * Journal des paquets distribués, paginé par curseur (« Charger plus »).
 * `source` vide = toutes les voies. Le type de page est celui du panneau.
 *
 * Les pages du filtre précédent restent servies (`isPlaceholderData`)
 * pendant qu'un autre se lit : le panneau en garde les comptes par source,
 * qui ne dépendent pas du filtre, et masque la liste.
 */
export function useTcgPackHistory<P extends { nextCursor: string | null }>(
  source: string,
  pageSize: number
) {
  return useInfiniteQuery({
    queryKey: tcgAdminKeys.packHistory(source),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      if (source) params.set('source', source);
      if (pageParam) params.set('cursor', pageParam);
      return client.packHistory<P>(params.toString());
    },
    getNextPageParam: (last) => last.nextCursor ?? null,
    placeholderData: keepPreviousData,
    ...NO_FOCUS,
  });
}

export function useTcgAssociation<T>() {
  return useQuery({
    queryKey: tcgAdminKeys.association,
    queryFn: () => client.association<T>(),
    ...NO_FOCUS,
  });
}

export function useTcgWelcomeGift<T>() {
  return useQuery({
    queryKey: tcgAdminKeys.welcomeGift,
    queryFn: () => client.welcomeGift<T>(),
    ...NO_FOCUS,
  });
}

/** Simulation du rattrapage (réponse brute, normalisée par la carte). */
export function useTcgBattlenetBackfill() {
  return useQuery({
    queryKey: tcgAdminKeys.battlenetBackfill,
    queryFn: client.battlenetBackfill,
    retry: false,
    ...NO_FOCUS,
  });
}

/** Relit une lecture TCG et attend la fin. */
export function useReloadTcg() {
  const qc = useQueryClient();
  return useCallback(
    (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key }),
    [qc]
  );
}
