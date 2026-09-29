// features/admin/stages/hooks/useStage.ts — fiche d'une phase
// (`GET /api/admin/stages/[stageId]`) et son journal, lot L10.
//
// La fiche est lue par la page de phase ET par les onglets (poules,
// historique…) qui n'en veulent que le type et le tournoi parent : une seule
// requête pour tous.

import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/utils/admin/adminHttp';
import { withFallback } from '@/features/admin/tournaments/client';
import { stageUrls } from '../client';
import { stageKeys } from './keys';

const MOUNT_ONLY = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export const stageDetailKey = (id: string) => stageKeys.part(id, 'detail');

/** `S` : forme sous laquelle l'écran lit la phase. */
export function useStage<
  S = { stage_type?: string | null; tournament_id?: string | null },
>(id: string, options: { editor?: boolean } = {}) {
  return useQuery({
    queryKey: stageDetailKey(id),
    queryFn: () => adminRequest<{ stage?: S }>(stageUrls.byId(id)),
    enabled: !!id,
    ...MOUNT_ONLY,
    ...(options.editor ? { staleTime: 0, gcTime: 0 } : {}),
  });
}

export type StageHistoryFilters = {
  limit: number;
  entityType: string;
  action: string;
};

/** Journal staff d'une phase ; `L` : forme d'une ligne à l'écran. */
export function useStageHistory<L>(
  id: string,
  filters: StageHistoryFilters,
  loadError: string
) {
  return useQuery({
    queryKey: stageKeys.part(id, 'history', filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(filters.limit));
      if (filters.entityType) params.set('entityType', filters.entityType);
      if (filters.action) params.set('action', filters.action);
      const json = await withFallback(
        adminRequest<{ logs?: L[] }>(stageUrls.history(id, params)),
        loadError
      );
      return json.logs || [];
    },
    enabled: !!id,
    ...MOUNT_ONLY,
  });
}

/**
 * Lecture d'une sous-ressource de phase (`swiss`, `groups`, `standings`…),
 * relue à l'ouverture et après chaque geste de l'écran, jamais sur un simple
 * retour d'onglet. `R` : forme de la réponse.
 */
export function useStageRead<R>(
  id: string,
  part: string,
  url: (id: string) => string,
  options: {
    enabled?: boolean;
    /**
     * Chaque lecture rend un NOUVEL objet : l'écran qui réinitialise une
     * saisie à chaque lecture le fait aussi quand rien n'a changé.
     */
    rehydrate?: boolean;
  } = {}
) {
  return useQuery({
    queryKey: stageKeys.part(id, part),
    queryFn: () => adminRequest<R>(url(id)),
    enabled: !!id && options.enabled !== false,
    ...MOUNT_ONLY,
    ...(options.rehydrate ? { structuralSharing: false } : {}),
  });
}
