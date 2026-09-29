// features/admin/tcg/hooks/useTcgModeration.ts — files fan-arts et photos.
//
// Pas de relecture au retour sur l'onglet : ces files se rechargeaient
// seulement à l'ouverture et après chaque décision (inchangé).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import {
  type FanartDecision,
  type FanartStatus,
  type PhotoDecision,
  tcgModerationClient as client,
} from '../client';

export const tcgModerationKeys = {
  fanart: (status: FanartStatus) => adminKey('tcg', 'fanart', status),
  fanartAll: adminKey('tcg', 'fanart'),
  photos: adminKey('tcg', 'photos'),
};

export function useTcgFanart(status: FanartStatus) {
  return useQuery({
    queryKey: tcgModerationKeys.fanart(status),
    queryFn: () => client.fanart(status),
    refetchOnWindowFocus: false,
  });
}

/** Décision : relit les files (tous statuts) sans attendre — toast d'abord. */
export function useDecideTcgFanart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FanartDecision) => client.decideFanart(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: tcgModerationKeys.fanartAll });
    },
  });
}

export function useTcgPendingPhotos() {
  return useQuery({
    queryKey: tcgModerationKeys.photos,
    queryFn: client.photos,
    refetchOnWindowFocus: false,
  });
}

export function useDecideTcgPhoto() {
  return useMutation({
    mutationFn: (body: PhotoDecision) => client.decidePhoto(body),
  });
}
