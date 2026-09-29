// features/player/network/hooks/useDiscovery.ts — annuaire du réseau et
// visibilité de la joueuse sur le cache joueuse (lot P15).
//
// Trois onglets, une seule forme de réponse : « Découvrir » (recherche
// débouncée), « Je suis », « Mes abonnés ». Pagination par décalage
// (« Charger plus ») : `useInfiniteQuery`, une page = PAGE_SIZE joueuses.
// Un échec de la PREMIÈRE page est une erreur (bannière + réessayer), jamais
// une liste vide déguisée ; un échec de « charger plus » garde la liste.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { networkClient } from '../client';
import type {
  DirectoryPlayer,
  DiscoveryCard,
  DiscoverySearchResponse,
} from '../schemas';

export const DIRECTORY_PAGE_SIZE = 24;

export type DirectoryTab = 'discover' | 'following' | 'followers';

type Page = DiscoverySearchResponse;

export function useMyDiscoveryCard(enabled: boolean) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: playerKey(scope, 'network', 'card'),
    enabled,
    queryFn: async () => {
      try {
        return await networkClient.myCard();
      } catch (err) {
        logger.error('[player/discovery] self status error:', err);
        throw err;
      }
    },
    ...PLAYER_QUERY_OPTIONS,
  });
}

/**
 * Patch de ma carte ; l'état rendu par le serveur remplace le cache.
 * `optimistic` : le patch s'applique tout de suite et se rétablit sur refus
 * (interrupteurs de la carte du profil) ; sans, l'écran attend la réponse
 * (bandeau de l'annuaire).
 */
export function useUpdateDiscoveryCard({ optimistic = false } = {}) {
  const scope = usePlayerScope();
  const qc = useQueryClient();
  const key = playerKey(scope, 'network', 'card');
  return useMutation({
    mutationFn: networkClient.updateCard,
    onMutate: async (patch) => {
      if (!optimistic) return { previous: undefined };
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DiscoveryCard>(key);
      if (previous)
        qc.setQueryData<DiscoveryCard>(key, {
          ...previous,
          ...(patch as Partial<DiscoveryCard>),
        });
      return { previous };
    },
    onSuccess: (card) => qc.setQueryData<DiscoveryCard>(key, card),
    onError: (err, _patch, context) => {
      logger.error('[player/discovery] update error:', err);
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
  });
}

export function directoryKey(
  scope: ReturnType<typeof usePlayerScope>,
  tab: DirectoryTab,
  q: string
) {
  return playerKey(
    scope,
    'network',
    'directory',
    tab,
    tab === 'discover' ? q : ''
  );
}

export function useDirectory(tab: DirectoryTab, q: string, enabled: boolean) {
  const scope = usePlayerScope();
  return useInfiniteQuery({
    queryKey: directoryKey(scope, tab, q),
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Page> => {
      try {
        return tab === 'discover'
          ? await networkClient.search(q, DIRECTORY_PAGE_SIZE, pageParam)
          : await networkClient.follows(tab, DIRECTORY_PAGE_SIZE, pageParam);
      } catch (err) {
        logger.error('[player/discovery] load error:', err);
        throw err;
      }
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.players.length, 0);
      return loaded < last.total && last.players.length > 0
        ? loaded
        : undefined;
    },
    ...PLAYER_QUERY_OPTIONS,
  });
}

/**
 * Mise à jour locale après un suivi / désabonnement : compteur d'abonnés
 * ajusté ; sur « Je suis », se désabonner retire la fiche (et le total).
 */
export function applyFollowChange(
  data: InfiniteData<Page> | undefined,
  tab: DirectoryTab,
  authUserId: string,
  following: boolean
): InfiniteData<Page> | undefined {
  if (!data) return data;
  const drop = tab === 'following' && !following;
  const edit = (p: DirectoryPlayer): DirectoryPlayer =>
    p.authUserId === authUserId
      ? {
          ...p,
          isFollowing: following,
          followerCount: Math.max(0, p.followerCount + (following ? 1 : -1)),
        }
      : p;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      total: drop ? Math.max(0, page.total - 1) : page.total,
      players: drop
        ? page.players.filter((p) => p.authUserId !== authUserId)
        : page.players.map(edit),
    })),
  };
}

export function useFollowChange(tab: DirectoryTab, q: string) {
  const scope = usePlayerScope();
  const qc = useQueryClient();
  return (authUserId: string, following: boolean) =>
    qc.setQueryData<InfiniteData<Page>>(directoryKey(scope, tab, q), (data) =>
      applyFollowChange(data, tab, authUserId, following)
    );
}
