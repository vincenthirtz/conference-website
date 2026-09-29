// features/admin/demandes/hooks/useDemandesQueries.ts — lectures des demandes
// sur le cache partagé de l'admin (lot L10) : fiche, et demandes en attente
// d'une joueuse / d'une équipe (vues joueuse et capitaine). Un geste sur une
// demande invalide tout le domaine : la fiche et les vues se relisent seules.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { type DemandesListQuery, demandesClient } from '../client';

export const demandesKeys = {
  all: adminKey('demandes'),
  lists: () => [...demandesKeys.all, 'list'] as const,
  list: (q: DemandesListQuery) => [...demandesKeys.lists(), q] as const,
  detail: (id: string) => [...demandesKeys.all, 'detail', id] as const,
  tournamentFields: (tournamentId: string) =>
    [...demandesKeys.all, 'tournament-fields', tournamentId] as const,
};

/** Fiche d'une demande : hydrate la note staff (pas de relecture auto). */
export function useDemande<T>(id: string | null) {
  return useQuery({
    queryKey: demandesKeys.detail(id ?? ''),
    queryFn: () => demandesClient.get<T>(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

/**
 * Champs d'inscription du tournoi d'une demande. Best-effort : un refus (un
 * caster ne lit pas le tournoi) rend une liste vide, jamais une erreur.
 */
export function useDemandeTournamentFields(
  tournamentId: string | null | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: demandesKeys.tournamentFields(tournamentId ?? ''),
    queryFn: () =>
      demandesClient
        .tournamentFields(tournamentId as string)
        .then((tj) => tj.tournament?.registration_fields ?? [])
        .catch(() => []),
    enabled: enabled && !!tournamentId,
    refetchOnWindowFocus: false,
  });
}

/** Demandes filtrées (en attente d'une joueuse, d'une équipe…). */
export function useDemandesList<T>(q: DemandesListQuery, enabled = true) {
  return useQuery({
    queryKey: demandesKeys.list(q),
    queryFn: () => demandesClient.list<T>(q),
    enabled,
    select: (d) => d.demandes ?? [],
  });
}

export function useInvalidateDemandes() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: demandesKeys.all }),
    [qc]
  );
}
