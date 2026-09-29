// features/admin/diffusion/hooks/useBroadcastCards.ts — cartes de la console
// live qui ne dépendent ni du temps réel ni du sondage de secours : chaînes
// Twitch actives, santé du drop TCG. Aucune n'a le droit de bloquer le
// pilotage : pas de nouvel essai (un échec masque la carte aussitôt, comme
// avant), pas de relecture au retour sur l'onglet (lecture unique au montage,
// comme avant).

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { broadcastCardsClient } from '../liveClient';

export const broadcastCardsKeys = {
  all: adminKey('broadcast-cards'),
  twitchChannels: () => [...broadcastCardsKeys.all, 'twitch-channels'] as const,
  tcgDrop: () => [...broadcastCardsKeys.all, 'tcg-drop'] as const,
};

const oneShot = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export function useActiveTwitchChannels() {
  return useQuery({
    queryKey: broadcastCardsKeys.twitchChannels(),
    queryFn: broadcastCardsClient.activeTwitchChannels,
    ...oneShot,
  });
}

export function useTcgDropState() {
  return useQuery({
    queryKey: broadcastCardsKeys.tcgDrop(),
    queryFn: broadcastCardsClient.tcgDropState,
    ...oneShot,
  });
}

/** Relit l'état du drop (après une mise en service, réussie ou non). */
export function useReloadTcgDropState() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: broadcastCardsKeys.tcgDrop() }),
    [qc]
  );
}
