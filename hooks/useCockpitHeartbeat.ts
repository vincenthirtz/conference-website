// hooks/useCockpitHeartbeat.ts
//
// Feature: Run-of-show — Lot 5.
// Hook qui POST /api/caster/heartbeat toutes les 20s tant que :
//   - un accessToken caster est dispo
//   - document.visibilityState === 'visible'
//
// Fire un premier ping immediat au mount (sinon le Director attend 20s pour
// voir le caster online).
//
// Pas de toast sur erreur : la connectivite reelle est verifiee par le polling
// cue. On log via logger.warn pour le debug.

import { useEffect, useRef } from 'react';
import { logger } from '@/utils/logger';

const HEARTBEAT_INTERVAL_MS = 20_000;

type UseCockpitHeartbeatParams = {
  /** event_run_id du run live courant. null si pas de run live attache. */
  runId: string | null;
  /** Bearer token caster (Supabase session). null si pas connecte. */
  accessToken: string | null;
};

export function useCockpitHeartbeat({
  runId,
  accessToken,
}: UseCockpitHeartbeatParams): void {
  // Ref pour eviter de relancer l interval a chaque changement de runId :
  // le tick lit la valeur courante via la ref, l interval reste stable.
  const runIdRef = useRef<string | null>(runId);
  const tokenRef = useRef<string | null>(accessToken);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return undefined;

    let cancelled = false;

    async function ping() {
      if (cancelled) return;
      const token = tokenRef.current;
      if (!token) return;
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      try {
        const res = await fetch('/api/caster/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ event_run_id: runIdRef.current ?? null }),
        });
        if (!res.ok) {
          // 400 si runId pointe vers un run non-live : c est attendu si le
          // run vient de passer "done" — on ne spamme pas l user.
          logger.warn('[cockpit-heartbeat] non-ok response', res.status);
        }
      } catch (err) {
        logger.warn('[cockpit-heartbeat] network error', err);
      }
    }

    // Ping immediat puis interval.
    ping();
    const handle = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    // Ping additionnel quand l onglet redevient visible — utile si on a saute
    // plusieurs intervalles en arriere-plan.
    function onVisibility() {
      if (document.visibilityState === 'visible') ping();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      cancelled = true;
      clearInterval(handle);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
    // L interval ne depend QUE de la presence du token. Le runId courant est
    // lu via runIdRef pour qu un changement (run qui devient null, run qui
    // change) n entraine pas un teardown / reschedule.
  }, [accessToken]);
}
