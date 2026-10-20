// features/admin/library/hooks/useLibraryBans.ts — bannissements de la
// Women's Library (onglet « Library » de /admin/moderation).
//
// Une écriture (bannir, lever) relit la liste : le serveur décide de ce qui
// est « en cours » (échéance comparée à SON horloge), le panneau ne le devine
// pas.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { libraryBansClient } from '../client';
import type { LibraryBanCreateInput } from '../schemas';

export const libraryBanKeys = {
  all: adminKey('library-bans'),
  active: () => [...libraryBanKeys.all, 'active'] as const,
};

export function useActiveLibraryBans() {
  return useQuery({
    queryKey: libraryBanKeys.active(),
    queryFn: libraryBansClient.listActive,
  });
}

export function useBanFromLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryBanCreateInput) => libraryBansClient.ban(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: libraryBanKeys.all });
    },
  });
}

export function useLiftLibraryBans() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => libraryBansClient.lift(userId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: libraryBanKeys.all });
    },
  });
}
