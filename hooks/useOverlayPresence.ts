// hooks/useOverlayPresence.ts
//
// Quels overlays sont affichés MAINTENANT (`GET /api/admin/diffusion/
// overlay-presence`), relu toutes les 15 s tant que l'onglet est visible et au
// retour sur l'onglet. `null` tant qu'on ne sait pas — ou si la lecture échoue
// (migration absente, droits) : l'écran n'affiche alors aucun badge plutôt
// qu'un faux « éteint ».
//
// L'état « affiché » se calcule sur l'heure du SERVEUR (`now` de la réponse),
// décalée du temps écoulé depuis : l'horloge d'un poste de régie qui dérive ne
// doit pas éteindre une source bien vivante.

import { useCallback, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { isOverlayLive } from '@/utils/overlays/heartbeat';

const POLL_MS = 15_000;

export type OverlayPresence = {
  /** La source a-t-elle signalé récemment ? */
  isLive: (source: string) => boolean;
  /** Secondes depuis le dernier signal, ou `null` s'il n'y en a jamais eu. */
  secondsAgo: (source: string) => number | null;
};

export function useOverlayPresence(): OverlayPresence | null {
  const { adminFetchJson } = useAdminFetch();
  const [data, setData] = useState<{
    sources: Record<string, string>;
    /** Décalage horloge serveur − horloge du poste, en ms. */
    skew: number;
  } | null>(null);

  const read = useCallback(async () => {
    try {
      const json = await adminFetchJson<{
        sources: Record<string, string>;
        now: string;
      }>('/api/admin/diffusion/overlay-presence', { skipAuthRedirect: true });
      const serverNow = Date.parse(json.now);
      setData({
        sources: json.sources ?? {},
        skew: Number.isFinite(serverNow) ? serverNow - Date.now() : 0,
      });
    } catch {
      setData(null);
    }
  }, [adminFetchJson]);

  useVisiblePoll(() => void read(), POLL_MS, { immediate: true });

  if (!data) return null;
  const now = () => Date.now() + data.skew;
  return {
    isLive: (source) => isOverlayLive(data.sources[source], now()),
    secondsAgo: (source) => {
      const t = Date.parse(data.sources[source] ?? '');
      return Number.isFinite(t)
        ? Math.max(0, Math.round((now() - t) / 1000))
        : null;
    },
  };
}
