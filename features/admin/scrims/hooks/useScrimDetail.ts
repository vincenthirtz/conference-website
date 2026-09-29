// features/admin/scrims/hooks/useScrimDetail.ts — fiche scrim et fiche de
// grille (When2Meet).
//
// Ces fiches ÉDITENT une copie locale : pas de relecture automatique (focus,
// reconnexion) qui écraserait une saisie ou une peinture de créneaux en
// cours. On relit à l'ouverture et après chaque action, comme avant.

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey } from '../../_shared/query';
import { scrimsClient } from '../client';

const NO_AUTO_REFETCH = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export const scrimsKeys = {
  all: adminKey('scrims'),
  detail: (id: string) => [...scrimsKeys.all, 'detail', id] as const,
  matches: (id: string) => [...scrimsKeys.all, 'matches', id] as const,
  planning: (id: string) => [...scrimsKeys.all, 'planning', id] as const,
  myPlanningSlots: (id: string) =>
    [...scrimsKeys.all, 'planning', id, 'mine'] as const,
  planningConflicts: (id: string, slots: string[], generation: number) =>
    [
      ...scrimsKeys.all,
      'planning',
      id,
      'conflicts',
      slots,
      generation,
    ] as const,
};

export function useScrim(id: string) {
  return useQuery({
    queryKey: scrimsKeys.detail(id),
    queryFn: () => scrimsClient.get(id),
    enabled: !!id,
    ...NO_AUTO_REFETCH,
  });
}

export function useScrimMatches(id: string) {
  return useQuery({
    queryKey: scrimsKeys.matches(id),
    queryFn: () => scrimsClient.matches(id),
    enabled: !!id,
    ...NO_AUTO_REFETCH,
  });
}

export function useUpdateScrim(id: string) {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      scrimsClient.update(id, body),
  });
}

/** Suppression ; l'écran quitte aussitôt la fiche (pas de relecture). */
export function useDeleteScrim(id: string) {
  return useMutation({ mutationFn: () => scrimsClient.remove(id) });
}

export function useScrimPlanning(id: string) {
  return useQuery({
    queryKey: scrimsKeys.planning(id),
    queryFn: () => scrimsClient.planning(id),
    enabled: !!id,
    ...NO_AUTO_REFETCH,
  });
}

/** Mes créneaux staff sur la grille (peinture perso). */
export function useMyPlanningSlots(id: string) {
  return useQuery({
    queryKey: scrimsKeys.myPlanningSlots(id),
    queryFn: () => scrimsClient.myPlanningSlots(id),
    enabled: !!id,
    ...NO_AUTO_REFETCH,
  });
}

/**
 * Aperçu des conflits (double-booking) des meilleurs créneaux. `generation`
 * = horodatage de la dernière lecture de la grille : l'aperçu est relu à
 * CHAQUE relecture de la grille (comme l'ancien effet, qui dépendait du
 * classement recalculé), pas seulement quand la liste de créneaux change.
 */
export function usePlanningConflicts(
  id: string,
  slots: string[],
  generation: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: scrimsKeys.planningConflicts(id, slots, generation),
    queryFn: () => scrimsClient.planningConflicts(id, slots),
    enabled: enabled && !!id && slots.length > 0,
    // L'aperçu précédent reste affiché pendant la relecture.
    placeholderData: keepPreviousData,
    retry: false,
    ...NO_AUTO_REFETCH,
  });
}

/** Relit la fiche scrim (scrim + matchs + équipes), en attendant la fin. */
export function useReloadScrim(id: string) {
  const qc = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: scrimsKeys.detail(id) }),
        qc.invalidateQueries({ queryKey: scrimsKeys.matches(id) }),
        qc.invalidateQueries({ queryKey: adminKey('teams', 'options') }),
      ]).then(() => undefined),
    [qc, id]
  );
}

/** Relit la grille et mes créneaux, en attendant la fin. */
export function useReloadPlanning(id: string) {
  const qc = useQueryClient();
  return useCallback(
    () =>
      // `exact` : l'aperçu des conflits se relit de lui-même (sa clé suit
      // l'horodatage de la grille) — l'invalider ici le relirait deux fois.
      Promise.all([
        qc.invalidateQueries({
          queryKey: scrimsKeys.planning(id),
          exact: true,
        }),
        qc.invalidateQueries({
          queryKey: scrimsKeys.myPlanningSlots(id),
          exact: true,
        }),
      ]).then(() => undefined),
    [qc, id]
  );
}
