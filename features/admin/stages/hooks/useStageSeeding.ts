// features/admin/stages/hooks/useStageSeeding.ts — comparateur de seeding
// d'une phase bracket (pages/admin/stages/[stageId]/seeding), lot L10.
//
// Deux aperçus, relus à chaque changement de paramètre (source, motif,
// méthode, poids SoS) comme avant. Les écritures (auto / manuel / rating)
// restent sur `useIdempotentMutation` (file hors ligne), chemins
// `stageUrls.*`. Après une écriture, `invalidateSeeding` relit les aperçus.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminRequest } from '@/utils/admin/adminHttp';
import { stageUrls } from '../client';
import { stageKeys } from './keys';

const NO_AUTO_REFETCH = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  // Un paramètre revisité est relu, comme avant (pas de cache de 30 s).
  staleTime: 0,
} as const;

/** `P` : forme de l'aperçu telle que l'écran la lit. */
export function useSeedingPreview<P>(
  id: string,
  sourceStageId: string,
  pattern: string
) {
  return useQuery({
    queryKey: stageKeys.part(id, 'seeding', 'preview', sourceStageId, pattern),
    queryFn: () => {
      const params = new URLSearchParams();
      if (sourceStageId) params.set('sourceStageId', sourceStageId);
      params.set('pattern', pattern);
      return adminRequest<P>(stageUrls.seedingPreview(id, params.toString()));
    },
    enabled: !!id,
    ...NO_AUTO_REFETCH,
    // Chaque lecture ré-amorce le draft vidé, même sans changement serveur.
    structuralSharing: false,
  });
}

/** `R` : forme de l'aperçu par rating. `sosWeight` : saisie brute. */
export function useRatingSeedingPreview<R>(
  id: string,
  method: string,
  pattern: string,
  sosWeight: string
) {
  const w = Number(sosWeight);
  const weight =
    sosWeight.trim() !== '' && Number.isFinite(w) ? String(w) : null;
  return useQuery({
    queryKey: stageKeys.part(id, 'seeding', 'rating', method, pattern, weight),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('method', method);
      params.set('pattern', pattern);
      if (weight !== null) params.set('sosWeight', weight);
      return adminRequest<R>(stageUrls.ratingSeedingPreview(id, params));
    },
    enabled: !!id,
    retry: false,
    ...NO_AUTO_REFETCH,
  });
}

export function useInvalidateSeeding(id: string) {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: stageKeys.part(id, 'seeding') }),
    [qc, id]
  );
}
