// features/admin/library/hooks/useLibraryAccess.ts — l'ACCÈS à la Women's
// Library (panneau « Accès à la Library » de /admin/moderation, lot 14c).
//
// Le réglage n'est PAS relu au retour sur l'onglet : le panneau édite un
// brouillon, et une relecture qui apporterait une nouvelle version le
// remplacerait en silence. Un enregistrement périmé est refusé par l'API
// (409) : on relit alors, et le panneau affiche la version à jour.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { adminKey } from '../../_shared/query';
import { libraryAccessAdminClient } from '../accessClient';
import { LIBRARY_ACCESS_ADMIN_CODES } from '../accessModel';
import type { LibraryAccessUpdateInput } from '../accessSchemas';

export const libraryAccessKeys = {
  all: adminKey('library-access'),
  settings: () => [...libraryAccessKeys.all, 'settings'] as const,
  teamSearch: (q: string) =>
    [...libraryAccessKeys.all, 'team-search', q] as const,
};

/** Lettres tapées avant de chercher une équipe. */
export const LIBRARY_ACCESS_TEAM_SEARCH_MIN = 2;

/** Code métier d'un refus de la route (`library_access_conflict`, …). */
export function libraryAccessErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

export function useLibraryAccess() {
  return useQuery({
    queryKey: libraryAccessKeys.settings(),
    queryFn: libraryAccessAdminClient.get,
    refetchOnWindowFocus: false,
  });
}

export function useSaveLibraryAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryAccessUpdateInput) =>
      libraryAccessAdminClient.save(body),
    onSuccess: (data) => {
      qc.setQueryData(libraryAccessKeys.settings(), data);
    },
    onError: (err) => {
      if (libraryAccessErrorCode(err) === LIBRARY_ACCESS_ADMIN_CODES.conflict) {
        void qc.invalidateQueries({ queryKey: libraryAccessKeys.settings() });
      }
    },
  });
}

/** Recherche d'équipes de l'espace, après une courte pause de frappe. */
export function useLibraryAccessTeamSearch(query: string) {
  const q = useDebounce(query.trim(), 250);
  const enabled = q.length >= LIBRARY_ACCESS_TEAM_SEARCH_MIN;
  const search = useQuery({
    queryKey: libraryAccessKeys.teamSearch(q),
    queryFn: () => libraryAccessAdminClient.searchTeams(q),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  return { ...search, enabled, teams: search.data?.teams ?? [] };
}
