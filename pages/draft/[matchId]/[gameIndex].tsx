// pages/draft/[matchId]/[gameIndex].tsx
// Public stream-friendly spectator view of a live MOBA draft (Lot 5).
//
// Designed for OBS browser sources : dark background, no chrome, splash
// arts large, all updates pushed via Supabase Realtime (with a 5s
// s-maxage fallback on the public API endpoint behind it).
//
// URL shape : /draft/<matchId>/<gameIndex>?title=Phoenix%20vs%20Dragons

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { useDraftState } from '@/hooks/useDraftState';
import { isValidUUID } from '@/utils/apiHelpers';
import { SpectatorView } from '@/components/draft/SpectatorView';

const PUBLIC_DRAFT_FETCHER = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
};

function PublicDraftPage() {
  const router = useRouter();
  const matchIdRaw = router.query.matchId;
  const gameIndexRaw = router.query.gameIndex;
  const titleRaw = router.query.title;
  const matchId = typeof matchIdRaw === 'string' ? matchIdRaw : '';
  const gameIndex = Number(gameIndexRaw);
  const title = typeof titleRaw === 'string' ? titleRaw : undefined;
  const validIds =
    isValidUUID(matchId) && Number.isInteger(gameIndex) && gameIndex >= 1;

  const endpoint = validIds
    ? `/api/matches/${encodeURIComponent(matchId)}/drafts/${gameIndex}`
    : '';

  // Memoised so useDraftState's effect deps stay stable.
  const fetcher = useCallback(
    async <T,>(url: string): Promise<T> => PUBLIC_DRAFT_FETCHER<T>(url),
    []
  );

  const { state, loading, error } = useDraftState({
    matchId,
    gameIndex: gameIndex || 1,
    enabled: validIds,
    endpoint,
    fetcher,
  });

  if (!validIds) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Invalid draft URL
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>{title ? `${title} · Draft` : 'MOBA Draft'}</title>
        <meta name="robots" content="noindex" />
      </Head>
      {error ? (
        <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-red-300">
          {error}
        </main>
      ) : null}
      {loading && !state ? (
        <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-500">
          Loading draft…
        </main>
      ) : null}
      {state ? <SpectatorView state={state} title={title} /> : null}
    </>
  );
}

export default PublicDraftPage;
