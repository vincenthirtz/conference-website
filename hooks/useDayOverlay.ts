// hooks/useDayOverlay.ts
//
// Alimente la source « matchs du jour » (`/overlay/day`) depuis
// `GET /api/overlay/day`.
//
// Même contrat de robustesse que `useMatchOverlay`, et pour les mêmes raisons
// (six heures dans un OBS laissé ouvert) : boucle de fetch plutôt que Realtime,
// veille quand la source est cachée, et une erreur réseau ne vide JAMAIS
// l'écran — seules les erreurs de configuration (400/402/404) s'affichent.
// Intervalle plus long (15 s) : un programme bouge moins qu'un score, et la
// réponse est de toute façon cachée 15 s au CDN.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayDayResponse } from '@/pages/api/overlay/day';

type Options = {
  tournament: string | null;
  date?: string | null;
  tenant?: string | null;
  enabled?: boolean;
  intervalMs?: number;
};

export function useDayOverlay({
  tournament,
  date,
  tenant,
  enabled = true,
  intervalMs = 15_000,
}: Options): { data: OverlayDayResponse | null; fatal: string | null } {
  const [data, setData] = useState<OverlayDayResponse | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const inFlight = useRef(false);

  const url = tournament ? buildUrl(tournament, date, tenant) : null;

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
      setData((await res.json()) as OverlayDayResponse);
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
        if (typeof document !== 'undefined' && document.hidden) return;
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

function buildUrl(
  tournament: string,
  date?: string | null,
  tenant?: string | null
): string {
  const params = new URLSearchParams({ tournament });
  if (date) params.set('date', date);
  if (tenant) params.set('tenant', tenant);
  return `/api/overlay/day?${params.toString()}`;
}
