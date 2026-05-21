// hooks/usePublicEventRunRealtime.ts
//
// Variante public-only de useEventRunRealtime, pensee pour les pages fans
// (`/live` notamment).
//
// Difference principale avec le hook admin :
//   - Pas d ID de run en input (le run live est resolu cote serveur via
//     /api/events/[runIdOrSlug]/timeline ou un endpoint dedie).
//   - L abonnement realtime sur event_runs filtre `status=eq.live` ; les
//     transitions live→done / draft→live declencheraient un refetch parent.
//   - L abonnement event_segments filtre par event_run_id mais ne donnera
//     des resultats que si la policy RLS expose les rows aux anons (pas le
//     cas par defaut sur event_segments, qui est service_role only — donc
//     le hook ici sert essentiellement de filet pour le polling parent).
//
// Le hook ne touche pas a la donnee : il appelle juste `onTick` quand une
// notification realtime est recue (ou en polling sur l interval donne). C est
// au composant parent de re-fetch et merger.

import { useEffect } from 'react';
import { useRealtimeChannel } from './useRealtimeChannel';

type Options = {
  enabled?: boolean;
  runId: string | null;
  intervalMs?: number;
  onTick: () => void;
};

export function usePublicEventRunRealtime({
  enabled = true,
  runId,
  intervalMs = 30_000,
  onTick,
}: Options) {
  // Realtime best-effort.
  useRealtimeChannel({
    enabled: enabled && !!runId,
    channel: `public-event-run-${runId ?? 'none'}`,
    table: 'event_runs',
    filter: runId ? `id=eq.${runId}` : undefined,
    onChange: () => onTick(),
  });

  useRealtimeChannel({
    enabled: enabled && !!runId,
    channel: `public-event-segments-${runId ?? 'none'}`,
    table: 'event_segments',
    filter: runId ? `event_run_id=eq.${runId}` : undefined,
    onChange: () => onTick(),
  });

  // Polling fallback (visibility-gated).
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      onTick();
    }, intervalMs);
    return () => clearInterval(t);
  }, [enabled, intervalMs, onTick]);
}
