// features/admin/teams/hooks/useTeamsQueries.ts — lectures des écrans équipes
// sur le cache partagé de l'admin (lot L10).
//
// Les clés sont partagées entre la liste, la fiche, l'édition et leurs
// panneaux : la fiche et l'édition lisent les mêmes membres, l'édition et le
// panneau de disponibilités les mêmes tournois (une seule requête). Après une
// écriture, `useInvalidateTeam` relit l'équipe ET les listes : revenir à
// `/admin/teams` après une édition montre la ligne à jour sans rechargement.

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import type { TeamRow } from '@/types/admin';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import {
  type TeamListParams,
  type TeamListResponse,
  teamsClient,
} from '../client';

export const teamsKeys = {
  all: adminKey('teams'),
  lists: () => [...teamsKeys.all, 'list'] as const,
  list: (p: TeamListParams) => [...teamsKeys.lists(), p] as const,
  options: (limit: number) => [...teamsKeys.all, 'options', limit] as const,
  detail: (id: string) => [...teamsKeys.all, 'detail', id] as const,
  members: (id: string) => [...teamsKeys.detail(id), 'members'] as const,
  tournaments: (id: string) =>
    [...teamsKeys.detail(id), 'tournaments'] as const,
  availability: (id: string) =>
    [...teamsKeys.detail(id), 'availability'] as const,
  rosterLock: (id: string) => [...teamsKeys.detail(id), 'roster-lock'] as const,
  history: (id: string) => [...teamsKeys.detail(id), 'history'] as const,
  importApiKeys: () => [...teamsKeys.all, 'import-api-keys'] as const,
};

/**
 * Liste paginée. `initial` = première page rendue côté serveur : elle n'amorce
 * que la clé qu'elle décrit (mêmes filtres, même décalage).
 */
export function useTeamsList(
  params: TeamListParams,
  initial?: { params: TeamListParams; data: TeamListResponse }
) {
  const seeded =
    initial && JSON.stringify(initial.params) === JSON.stringify(params)
      ? initial.data
      : undefined;
  return useQuery({
    queryKey: teamsKeys.list(params),
    queryFn: () => teamsClient.list(params),
    initialData: seeded,
    // La page précédente reste affichée pendant le chargement de la suivante
    // (comme `useAdminResource`, qui ne vidait pas la liste).
    placeholderData: keepPreviousData,
  });
}

/** Liste courte pour les sélecteurs (création de compte, transfert…). */
export function useTeamOptions(limit: number, enabled = true) {
  return useQuery({
    queryKey: teamsKeys.options(limit),
    queryFn: () => teamsClient.options(limit),
    enabled,
    refetchOnWindowFocus: false,
  });
}

/** Fiche en lecture seule (`/admin/teams/[teamId]`). */
export function useTeam(id: string | undefined) {
  return useQuery({
    queryKey: teamsKeys.detail(id ?? ''),
    queryFn: () => teamsClient.get(id as string),
    enabled: !!id,
  });
}

/** Équipe qui HYDRATE le formulaire d'édition (pas de relecture auto). */
export function useTeamForEdit(id: string | undefined) {
  return useQuery({
    queryKey: teamsKeys.detail(id ?? ''),
    queryFn: () => teamsClient.get(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useTeamMembers(id: string | undefined) {
  return useQuery({
    queryKey: teamsKeys.members(id ?? ''),
    queryFn: () => teamsClient.members(id as string),
    enabled: !!id,
    select: (d) => d.members ?? [],
  });
}

export function useTeamTournaments(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: teamsKeys.tournaments(id ?? ''),
    queryFn: () => teamsClient.tournaments(id as string),
    enabled: enabled && !!id,
  });
}

export function useTeamAvailability(id: string) {
  return useQuery({
    queryKey: teamsKeys.availability(id),
    queryFn: () => teamsClient.availability(id),
    enabled: !!id,
    select: (d) => d.constraints ?? [],
  });
}

export function useTeamRosterLock(id: string) {
  return useQuery({
    queryKey: teamsKeys.rosterLock(id),
    queryFn: () => teamsClient.rosterLock(id),
    enabled: !!id,
    select: (d) => d.tournaments ?? [],
  });
}

/** Historique : chargé seulement au dépliage (`enabled`). */
export function useTeamHistory(id: string, limit: number, enabled: boolean) {
  return useQuery({
    queryKey: [...teamsKeys.history(id), limit],
    queryFn: () => teamsClient.history(id, limit),
    enabled: enabled && !!id,
    select: (d) => d.logs ?? [],
    refetchOnWindowFocus: false,
  });
}

/** Clés d'intégration d'import (modale « clés API »), lues à la demande. */
export function useFetchImportApiKeys() {
  const qc = useQueryClient();
  return useCallback(
    () =>
      qc.fetchQuery({
        queryKey: teamsKeys.importApiKeys(),
        queryFn: async () => {
          const keys = [
            'toornament_api_key',
            'challonge_api_key',
            'startgg_api_key',
          ];
          const fetched = await Promise.all(
            keys.map((k) => teamsClient.importApiKey(k))
          );
          return {
            toornament: fetched[0]?.value ?? '',
            challonge: fetched[1]?.value ?? '',
            startgg: fetched[2]?.value ?? '',
          };
        },
        // Des secrets : relus à chaque ouverture, jamais gardés.
        staleTime: 0,
        gcTime: 0,
      }),
    [qc]
  );
}

/** Relit les listes d'équipes (liste paginée + sélecteurs). */
export function useInvalidateTeamLists() {
  const qc = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: teamsKeys.lists() }),
        qc.invalidateQueries({ queryKey: [...teamsKeys.all, 'options'] }),
      ]).then(() => undefined),
    [qc]
  );
}

/**
 * Outils de relecture d'une équipe : chaque geste invalide ce qu'il touche ET
 * les listes, qui se mettent à jour d'elles-mêmes.
 */
export function useTeamCache(id: string | undefined) {
  const qc = useQueryClient();
  const invalidateLists = useInvalidateTeamLists();

  /** Pose la version renvoyée par le serveur (PATCH) sans relecture. */
  const setTeam = useCallback(
    (team: TeamRow) => {
      if (!id) return;
      qc.setQueryData(teamsKeys.detail(id), { team });
      void invalidateLists();
    },
    [qc, id, invalidateLists]
  );

  const refetchTeam = useCallback(async () => {
    if (!id) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: teamsKeys.detail(id), exact: true }),
      invalidateLists(),
    ]);
  }, [qc, id, invalidateLists]);

  const refetchMembers = useCallback(async () => {
    if (!id) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: teamsKeys.members(id) }),
      // L'effectif jouant (inscription à un tournoi) suit les membres.
      qc.invalidateQueries({ queryKey: teamsKeys.tournaments(id) }),
      invalidateLists(),
    ]);
  }, [qc, id, invalidateLists]);

  const refetchTournaments = useCallback(async () => {
    if (!id) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: teamsKeys.tournaments(id) }),
      qc.invalidateQueries({ queryKey: teamsKeys.rosterLock(id) }),
      invalidateLists(),
    ]);
  }, [qc, id, invalidateLists]);

  return { setTeam, refetchTeam, refetchMembers, refetchTournaments };
}
