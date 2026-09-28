// features/admin/free-players/hooks/useFreePlayers.ts — lecture et retrait,
// avec cache partagé : toute vue de la liste se met à jour après un retrait.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { freePlayersClient } from '../client';
import type { FreePlayerAdminList } from '../schemas';

export const freePlayersKeys = {
  all: adminKey('free-players'),
  list: () => [...freePlayersKeys.all, 'list'] as const,
};

export function useFreePlayersList() {
  return useQuery({
    queryKey: freePlayersKeys.list(),
    queryFn: freePlayersClient.list,
  });
}

export function useRemoveFreePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => freePlayersClient.remove(id),
    // Retrait immédiat de la ligne ; le serveur fait foi au rechargement.
    onSuccess: (_res, id) => {
      qc.setQueryData<FreePlayerAdminList>(freePlayersKeys.list(), (prev) =>
        prev ? { items: prev.items.filter((i) => i.id !== id) } : prev
      );
      void qc.invalidateQueries({ queryKey: freePlayersKeys.all });
    },
  });
}
