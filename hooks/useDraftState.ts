// hooks/useDraftState.ts
// Fetches the assembled DraftState for (matchId, gameIndex) from the admin
// API, then subscribes to Supabase Realtime on match_drafts +
// match_draft_steps so every ban/pick/timer change refetches the state.
//
// Lot 4 (captain UI) consumes this directly; Lot 5 (spectator UI) will
// pass `endpoint` to swap to the public read once we add it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';
import { useRealtimeChannel } from './useRealtimeChannel';
import type { DraftState } from '@/types/draft';

export type UseDraftStateOptions = {
  matchId: string;
  gameIndex: number;
  /** When false, no fetch + no subscription. Useful while ids load. */
  enabled?: boolean;
  /**
   * Override the read endpoint (defaults to the admin route). Lot 5 will
   * point this at the public spectator route.
   */
  endpoint?: string;
};

export type UseDraftStateReturn = {
  state: DraftState | null;
  loading: boolean;
  error: string | null;
  /** Manual refetch (e.g. right after a mutation). */
  refresh: () => Promise<void>;
};

type AdminDraftResponse = { draft: DraftState | null };

export function useDraftState({
  matchId,
  gameIndex,
  enabled = true,
  endpoint,
}: UseDraftStateOptions): UseDraftStateReturn {
  const { adminFetchJson } = useAdminFetch();
  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  // Stable ref so realtime callbacks always call the latest fetcher.
  const adminFetchJsonRef = useRef(adminFetchJson);
  useEffect(() => {
    adminFetchJsonRef.current = adminFetchJson;
  }, [adminFetchJson]);

  const url =
    endpoint ??
    `/api/admin/matches/${encodeURIComponent(matchId)}/drafts/${gameIndex}`;

  const refresh = useCallback(async () => {
    if (!enabled || !matchId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJsonRef.current<AdminDraftResponse>(url);
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
