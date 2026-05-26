// hooks/useDraftState.ts
// Fetches the assembled DraftState for (matchId, gameIndex), then subscribes
// to Supabase Realtime on match_drafts + match_draft_steps so every
// ban/pick/timer change refetches the state.
//
// Lot 4 (captain UI) consumes the admin variant (default), Lot 5 (spectator
// UI) injects a public fetcher + endpoint so OBS browser sources can
// embed the draft without an auth session.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';
import { useRealtimeChannel } from './useRealtimeChannel';
import type { DraftState } from '@/types/draft';

export type DraftStateFetcher = <T>(url: string) => Promise<T>;

export type UseDraftStateOptions = {
  matchId: string;
  gameIndex: number;
  /** When false, no fetch + no subscription. Useful while ids load. */
  enabled?: boolean;
  /**
   * Override the read endpoint. Defaults to the admin route; pass the
   * public route from the spectator page.
   */
  endpoint?: string;
  /**
   * Override the fetcher. Defaults to authenticated admin fetch (Bearer
   * + redirect-on-401). Pass an unauthenticated wrapper for the
   * spectator/public page.
   */
  fetcher?: DraftStateFetcher;
};

export type UseDraftStateReturn = {
  state: DraftState | null;
  loading: boolean;
  error: string | null;
  /** Manual refetch (e.g. right after a mutation). */
  refresh: () => Promise<void>;
};

type DraftResponse = { draft: DraftState | null };

export function useDraftState({
  matchId,
  gameIndex,
  enabled = true,
  endpoint,
  fetcher,
}: UseDraftStateOptions): UseDraftStateReturn {
  const { adminFetchJson } = useAdminFetch();
  const effectiveFetcher = fetcher ?? adminFetchJson;
  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  // Stable ref so realtime callbacks always call the latest fetcher.
  const fetcherRef = useRef(effectiveFetcher);
  useEffect(() => {
    fetcherRef.current = effectiveFetcher;
  }, [effectiveFetcher]);

  const url =
    endpoint ??
    `/api/admin/matches/${encodeURIComponent(matchId)}/drafts/${gameIndex}`;

  const refresh = useCallback(async () => {
    if (!enabled || !matchId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetcherRef.current<DraftResponse>(url);
      setState(data.draft ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [enabled, matchId, url]);

  // Initial load + reload on matchId/gameIndex change.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const draftId = state?.draft?.id ?? null;

  // Subscribe to match_drafts row updates (status / current_step / sides).
  useRealtimeChannel({
    enabled: enabled && !!draftId,
    channel: `draft-row-${draftId ?? 'none'}`,
    table: 'match_drafts',
    filter: draftId ? `id=eq.${draftId}` : undefined,
    onChange: () => void refresh(),
  });

  // Subscribe to match_draft_steps updates (hero_id, deadline_at).
  useRealtimeChannel({
    enabled: enabled && !!draftId,
    channel: `draft-steps-${draftId ?? 'none'}`,
    table: 'match_draft_steps',
    filter: draftId ? `draft_id=eq.${draftId}` : undefined,
    onChange: () => void refresh(),
  });

  return { state, loading, error, refresh };
}
