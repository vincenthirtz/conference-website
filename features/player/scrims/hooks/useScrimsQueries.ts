// features/player/scrims/hooks/useScrimsQueries.ts — lectures et gestes du
// module scrims sur le cache joueuse (lot P13).
//
// Clés `playerKey(scope, 'scrims', …)` : changer de sujet ou d'équipe active
// relit. Un geste invalide la lecture qu'il change (report → mes scrims ;
// recherche → ma recherche + annuaire ; peinture → la session).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { scrimsClient } from '../client';
import type {
  PlanningAvailabilityInput,
  ScrimReportInput,
  ScrimSearchInput,
} from '../schemas';

export const scrimsKeys = {
  myScrims: (scope: PlayerScope) => playerKey(scope, 'scrims', 'mine'),
  plannings: (scope: PlayerScope) => playerKey(scope, 'scrims', 'plannings'),
  planning: (scope: PlayerScope, id: string) =>
    playerKey(scope, 'scrims', 'planning', id),
  mySearch: (scope: PlayerScope) => playerKey(scope, 'scrims', 'search'),
  directory: (scope: PlayerScope) => playerKey(scope, 'scrims', 'directory'),
};

/** Mes scrims (à rapporter, à venir, récents). */
export function useMyScrims() {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: scrimsKeys.myScrims(scope),
    queryFn: () => scrimsClient.myScrims(scope),
    ...PLAYER_QUERY_OPTIONS,
  });
}

export function useReportScrim() {
  const scope = usePlayerScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scrimId,
      body,
    }: {
      scrimId: string;
      body: ScrimReportInput;
    }) => scrimsClient.report(scope, scrimId, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: scrimsKeys.myScrims(scope) }),
  });
}

/** Détail d'une session de planning (heatmap anonymisée, ma partie). */
export function useScrimPlanning(planningId: string | null) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: scrimsKeys.planning(scope, planningId ?? ''),
    queryFn: () => scrimsClient.planning(planningId as string),
    enabled: Boolean(planningId),
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** « Mes dispos habituelles » : lecture à la demande, pas de cache. */
export function useSuggestPlanningSlots(planningId: string) {
  return useMutation({
    mutationFn: () => scrimsClient.suggest(planningId),
  });
}

export function useSavePlanningAvailability(planningId: string) {
  return useMutation({
    mutationFn: (body: PlanningAvailabilityInput) =>
      scrimsClient.saveAvailability(planningId, body),
  });
}

/** Recherche de scrim active de mon équipe (ou null). */
export function useMyScrimSearch(enabled = true) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: scrimsKeys.mySearch(scope),
    queryFn: () => scrimsClient.mySearch(scope),
    enabled,
    ...PLAYER_QUERY_OPTIONS,
  });
}

function useSearchInvalidation() {
  const scope = usePlayerScope();
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: scrimsKeys.mySearch(scope) }),
      qc.invalidateQueries({ queryKey: scrimsKeys.directory(scope) }),
    ]);
}

export function useSaveScrimSearch() {
  const scope = usePlayerScope();
  const invalidate = useSearchInvalidation();
  return useMutation({
    mutationFn: (body: ScrimSearchInput) =>
      scrimsClient.saveSearch(scope, body),
    onSuccess: () => invalidate(),
  });
}

export function useCloseScrimSearch() {
  const scope = usePlayerScope();
  const invalidate = useSearchInvalidation();
  return useMutation({
    mutationFn: () => scrimsClient.closeSearch(scope),
    onSuccess: () => invalidate(),
  });
}

/** Annuaire d'équipes connecté (R4). */
export function useTeamsDirectory(enabled = true) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: scrimsKeys.directory(scope),
    queryFn: () => scrimsClient.directory(scope),
    enabled,
    ...PLAYER_QUERY_OPTIONS,
  });
}
