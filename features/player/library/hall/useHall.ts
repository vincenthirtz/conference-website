// features/player/library/hall/useHall.ts — les lectures du hall et des lieux
// communs sur le cache joueuse (lot 7 de docs/PLAN-womens-library.md) :
//   - `useCommonRoom`      : la salle d'un lieu commun (`?place=`), créée à la
//                            première visite ;
//   - `useHallAnnouncements` : le panneau d'annonces, RELU à chaque entrée
//                            dans le hall (une annonce postée sur Discord y
//                            apparaît à l'entrée suivante) ;
//   - `useOpenRooms`       : la liste des appartements ouverts, par pages.
// Une lecture ratée a son écran, jamais une liste vide inventée.

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { LibraryCommonRoomKind } from '@/config/library/commonRooms';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { useHallClient } from './clientContext';

export const hallKeys = {
  commonRoom: (scope: PlayerScope, kind: LibraryCommonRoomKind) =>
    playerKey(scope, 'library', 'common-room', kind),
  announcements: (scope: PlayerScope) =>
    playerKey(scope, 'library', 'hall', 'announcements'),
  openRooms: (scope: PlayerScope) =>
    playerKey(scope, 'library', 'hall', 'open-rooms'),
};

/**
 * La salle d'un lieu commun. Son identifiant ne change pas : lu une fois par
 * session. `enabled` = la porte de la Library est franchie (sinon l'API
 * répondrait le même refus que `me`).
 */
export function useCommonRoom(kind: LibraryCommonRoomKind, enabled: boolean) {
  const scope = usePlayerScope();
  const client = useHallClient();
  return useQuery({
    queryKey: hallKeys.commonRoom(scope, kind),
    queryFn: () => client.commonRoom(kind),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** Le panneau d'annonces : relu à chaque montage (chaque entrée dans le hall). */
export function useHallAnnouncements(enabled = true) {
  const scope = usePlayerScope();
  const client = useHallClient();
  return useQuery({
    queryKey: hallKeys.announcements(scope),
    queryFn: () => client.announcements(),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** Les appartements ouverts, page par page (`fetchNextPage`). */
export function useOpenRooms(enabled = true) {
  const scope = usePlayerScope();
  const client = useHallClient();
  return useInfiniteQuery({
    queryKey: hallKeys.openRooms(scope),
    queryFn: ({ pageParam }) => client.openRooms(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 0,
    ...PLAYER_QUERY_OPTIONS,
  });
}
