// features/admin/matches/hooks/useMatch.ts — fiche match (lecture, édition)
// et ses panneaux : historique, feuilles de match, casters, MVP.
//
// La fiche d'édition relit à l'ouverture et après chaque enregistrement
// (`EDITOR_QUERY_OPTIONS`) : jamais de relecture au focus qui écraserait une
// saisie. L'historique est partagé par le tiroir et la frise : une seule
// requête, relue après chaque geste qui l'alimente.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { matchesClient as client } from '../client';

export const matchesKeys = {
  all: adminKey('matches'),
  detail: (id: string) => adminKey('matches', 'detail', id),
  history: (id: string) => adminKey('matches', 'history', id),
  lineups: (id: string) => adminKey('matches', 'lineups', id),
  castAssignments: (id: string) => adminKey('matches', 'cast-assignments', id),
  castMembers: adminKey('matches', 'cast-members-options'),
  mapPool: (id: string) => adminKey('matches', 'map-pool', id),
  veto: (id: string) => adminKey('matches', 'veto', id),
  mvp: (id: string) => adminKey('matches', 'mvp', id),
};

/** Fiche en lecture (`/admin/matches/[id]`). */
export function useMatchDetail(id: string | undefined) {
  return useQuery({
    queryKey: matchesKeys.detail(id ?? ''),
    queryFn: () => client.detail(id as string),
    enabled: !!id,
  });
}

/** Fiche d'édition : pas de relecture automatique (saisie en cours). */
export function useMatchEditor(id: string | undefined) {
  return useQuery({
    queryKey: matchesKeys.detail(id ?? ''),
    queryFn: () => client.detail(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

/**
 * Pool de cartes et veto — best-effort : sans eux, le champ carte reste
 * libre et le bandeau veto ne s'affiche pas. Jamais d'erreur visible.
 */
export function useMatchMapPool(id: string | undefined) {
  return useQuery({
    queryKey: matchesKeys.mapPool(id ?? ''),
    queryFn: async () =>
      ((await client.mapPool(id as string)).maps ?? [])
        .map((m) => m.name)
        .filter(Boolean),
    enabled: !!id,
    retry: false,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useMatchVeto(id: string | undefined) {
  return useQuery({
    queryKey: matchesKeys.veto(id ?? ''),
    queryFn: async () => Boolean((await client.veto(id as string)).isComplete),
    enabled: !!id,
    retry: false,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useMatchHistory(id: string, enabled = true) {
  return useQuery({
    queryKey: matchesKeys.history(id),
    queryFn: async () => (await client.history(id)).logs ?? [],
    enabled: enabled && !!id,
    // Les deux vues masquent la liste pendant une lecture : pas de relecture
    // au focus (inchangé), seulement après un geste (`useInvalidateMatch`).
    refetchOnWindowFocus: false,
  });
}

/** Relit la fiche ET son historique (après un geste staff). */
export function useInvalidateMatch(id: string | undefined) {
  const qc = useQueryClient();
  return useCallback(() => {
    if (!id) return Promise.resolve();
    return Promise.all([
      qc.invalidateQueries({ queryKey: matchesKeys.detail(id) }),
      qc.invalidateQueries({ queryKey: matchesKeys.history(id) }),
    ]).then(() => undefined);
  }, [qc, id]);
}

export function useResolveMatchDispute(id: string) {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.resolveDispute(id, body),
  });
}

export function useCancelMatchDispute(id: string) {
  return useMutation({ mutationFn: () => client.cancelDispute(id) });
}

// --- Feuilles de match (line-ups)

export function useMatchLineups(id: string) {
  return useQuery({
    queryKey: matchesKeys.lineups(id),
    queryFn: async () => (await client.lineups(id)).lineups ?? [],
    enabled: !!id,
  });
}

export function useMatchLineupAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.lineupAction(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: matchesKeys.lineups(id) }),
  });
}

// --- Casters assignés

export function useMatchCastAssignments(id: string) {
  return useQuery({
    queryKey: matchesKeys.castAssignments(id),
    queryFn: async () => (await client.castAssignments(id)).assignments ?? [],
    enabled: !!id,
  });
}

/** Liste des casters (toutes formes de réponse acceptées). */
export function useCastMemberOptions() {
  return useQuery({
    queryKey: matchesKeys.castMembers,
    queryFn: async () => {
      const c = await client.castMembers();
      return Array.isArray(c) ? c : (c?.castMembers ?? c?.items ?? []);
    },
  });
}

export function useCastAssignmentMutations(id: string) {
  const qc = useQueryClient();
  const onSuccess = () =>
    qc.invalidateQueries({ queryKey: matchesKeys.castAssignments(id) });
  return {
    add: useMutation({
      mutationFn: (body: { castMemberId: string; briefingAt: string }) =>
        client.addCastAssignment(id, body),
      onSuccess,
    }),
    reschedule: useMutation({
      mutationFn: (v: { assignmentId: string; briefingAt: string }) =>
        client.rescheduleCastAssignment(id, v.assignmentId, v.briefingAt),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (assignmentId: string) =>
        client.removeCastAssignment(id, assignmentId),
      onSuccess,
    }),
  };
}

// --- MVP

export function useMatchMvp(id: string) {
  return useQuery({
    queryKey: matchesKeys.mvp(id),
    queryFn: () => client.mvp(id),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}
