// hooks/useOverlayState.ts
//
// Feature: Production broadcast automatisée (roadmap #07) — public overlay
// renderer (OBS browser source).
//
// Fetches `GET /api/overlay/{runId}` (public, s-maxage=5) and keeps it fresh:
//   1. Supabase Realtime on the `event_runs` row (via
//      usePublicEventRunRealtime) → any broadcast_state / status write on the
//      run refetches the overlay payload, so a scene switch renders near-
//      instantly.
//   2. A ~5s polling fallback (visibility-gated, provided by the same hook)
//      so the overlay stays correct if the Realtime socket drops mid-show.
//
// Mirrors the draft spectator pattern (hooks/useDraftState.ts): public fetcher,
// no auth session, subscription + polling. Designed to run for hours in OBS —
// timers and channels are cleaned up on unmount by the underlying hooks.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePublicEventRunRealtime } from './usePublicEventRunRealtime';

export type OverlayScene =
  | 'starting'
  | 'match'
  | 'pause'
  | 'results'
  | 'end'
  | 'custom';

export type OverlayTeam = {
  name: string;
  logoUrl: string | null;
  score: number | null;
};

export type OverlayMatch = {
  team1: OverlayTeam | null;
  team2: OverlayTeam | null;
  format: string | null;
  status: string | null;
} | null;

export type OverlaySponsor = {
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

export type OverlayPayload = {
  scene: OverlayScene;
  onAir: boolean;
  lowerThird: string | null;
  pip: { enabled: boolean };
  match: OverlayMatch;
  sponsors: OverlaySponsor[];
};

type Options = {
  runId: string | null;
  /** Skip fetch + subscription while ids resolve. */
  enabled?: boolean;
  /** Polling fallback interval (default 5s, matching the API s-maxage). */
  intervalMs?: number;
};

type Return = {
  data: OverlayPayload | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useOverlayState({
  runId,
  enabled = true,
  intervalMs = 5_000,
}: Options): Return {
  const [data, setData] = useState<OverlayPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled || !runId) return;
    try {
      const res = await fetch(`/api/overlay/${encodeURIComponent(runId)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OverlayPayload;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [enabled, runId]);

  // Stable tick handed to the realtime/polling hook: recreating it on every
  // render would churn the Supabase channel subscription.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);
  const onTick = useCallback(() => {
    void refetchRef.current();
  }, []);

  // Initial load + reload when the run id changes.
  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Realtime on the event_runs row (scene/status writes) + polling fallback.
  usePublicEventRunRealtime({
    enabled: enabled && !!runId,
    runId,
    intervalMs,
    onTick,
  });

  return { data, loading, error, refetch };
}
