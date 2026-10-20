// features/player/library/hall/useHallTournament.ts — la lecture du tableau
// du tournoi en cours sur le cache joueuse (lot 7 de
// docs/PLAN-womens-library.md).
//
// RELU À CHAQUE OUVERTURE, comme le panneau d'annonces : le panneau monte à
// l'ouverture (`staleTime: 0`, `refetchOnMount: 'always'`) — un score posé
// pendant qu'on lisait autre chose apparaît à la réouverture. Un seul nouvel
// essai sur une panne, aucun sur une 4xx : le panneau a son « Réessayer ».
//
// Importé par le panneau SEUL (`ui/hall/TournamentBoardPanel`, chargé à la
// demande) : jamais par `useHall.ts`, qui est dans le premier chargement.

import { useQuery } from '@tanstack/react-query';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  playerRetry,
  usePlayerScope,
} from '../../_shared/query';
import { loadTournamentBoard } from './tournamentClient';

export const hallTournamentKey = (scope: PlayerScope) =>
  playerKey(scope, 'library', 'hall', 'tournament');

export function useHallTournament() {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: hallTournamentKey(scope),
    queryFn: () => loadTournamentBoard(),
    staleTime: 0,
    refetchOnMount: 'always',
    ...PLAYER_QUERY_OPTIONS,
    retry: (count: number, err: unknown) =>
      count < 1 && playerRetry(count, err),
  });
}
