// hooks/useOverlayPoll.ts
//
// Boucle de lecture commune des sources OBS « liste » (`/overlay/day`,
// `/overlay/scrims`).
//
// Même contrat de robustesse que `useMatchOverlay`, pour les mêmes raisons (six
// heures dans un OBS laissé ouvert) : fetch en boucle plutôt que Realtime,
// veille quand la source est cachée, rattrapage au retour, et une erreur
// réseau ne vide JAMAIS l'écran — seules les erreurs de configuration
// (400/402/404) s'affichent, parce qu'elles ne se corrigeront pas seules.

import { useCallback, useEffect, useRef, useState } from 'react';

export function useOverlayPoll<T>(
  url: string | null,
  { enabled = true, intervalMs = 15_000 } = {}
): { data: T | null; fatal: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!url || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        if (res.status === 400 || res.status === 402 || res.status === 404) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setFatal(body?.error ?? 'Source indisponible.');
        }
        return;
      }
      setFatal(null);
      setData((await res.json()) as T);
    } catch {
      // Réseau : on garde l'affichage, la boucle repassera.
    } finally {
      inFlight.current = false;
    }
  }, [url]);

  useEffect(() => {
    if (!enabled || !url) return undefined;
    void fetchOnce();
    const timer = setInterval(
      () => {
        if (document.hidden) return;
        void fetchOnce();
      },
      Math.max(5000, intervalMs)
    );
    const onVisible = () => {
      if (!document.hidden) void fetchOnce();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, url, intervalMs, fetchOnce]);

  return { data, fatal };
}
