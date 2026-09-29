// features/player/network/client.ts — appels typés du réseau de la joueuse
// (lot P15). Toutes ces routes sont `subject: 'self'` : AUCUNE portée n'est
// suffixée (un `?as=` y serait refusé en 403).
//
// Le bouton « Suivre » et la couche sociale de la fiche PUBLIQUE
// (/player/[userId]) n'utilisent PAS ce client : une page publique ne tire ni
// TanStack ni features/player (tests/unit/adminBoundariesGuard.test.ts).

import { playerRequest } from '@/utils/player/playerHttp';
import type {
  DiscoveryCard,
  DiscoveryPutInput,
  DiscoverySearchResponse,
  FollowsListResponse,
  FollowsListType,
} from './schemas';

export const networkUrls = {
  discovery: '/api/player/discovery',
  search: '/api/player/discovery/search',
  follows: '/api/player/follows',
};

function withParams(url: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  );
  return `${url}?${qs.toString()}`;
}

export const networkClient = {
  myCard: () =>
    playerRequest<DiscoveryCard>(networkUrls.discovery, {
      skipAuthRedirect: true,
    }),
  /** Pose des valeurs (patch partiel) : un rejeu ne change rien de plus. */
  updateCard: (patch: DiscoveryPutInput) =>
    playerRequest<DiscoveryCard>(networkUrls.discovery, {
      method: 'PUT',
      json: patch,
      idempotent: true,
    }),
  search: (q: string, limit: number, offset: number) =>
    playerRequest<DiscoverySearchResponse>(
      withParams(networkUrls.search, { limit, offset, q }),
      { skipAuthRedirect: true }
    ),
  follows: (type: FollowsListType, limit: number, offset: number) =>
    playerRequest<FollowsListResponse>(
      withParams(networkUrls.follows, { limit, offset, type }),
      { skipAuthRedirect: true }
    ),
};
