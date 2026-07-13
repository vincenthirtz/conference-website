// pages/player/discovery.tsx
// Espace joueur — "Réseau joueuses" (découverte inter-organisations).
//
// Annuaire opt-in GLOBAL, INVISIBLE par défaut, DERRIÈRE LOGIN. On ne liste
// que les joueuses qui ont activé leur visibilité (cf. la section Découverte
// de /player/profile). Recherche débouncée sur /api/player/discovery/search,
// résultats en grille de fiches liant vers le profil public /player/[userId].
//
// Un bandeau invite la caller à s'activer si elle-même n'est pas encore
// découvrable (GET /api/player/discovery au montage).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { DiscoveryCardData } from '@/components/player/DiscoveryCard';

import { logger } from '../../utils/logger';

const PAGE_SIZE = 24;

type DiscoveryPlayer = {
  authUserId: string;
  displayName: string;
  avatarUrl: string | null;
  tagline: string | null;
  discordUsername: string | null;
  stats?: {
    games: number;
    peakRating: number;
    tenants: number;
  };
};

type SearchResponse = {
  players: DiscoveryPlayer[];
  total: number;
  limit: number;
  offset: number;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((p) => p.charAt(0).toUpperCase()).join('');
  return letters || 'J';
}

function PlayerDiscovery() {
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({
    redirectTo: '/login?next=/player/discovery',
  });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const t = useT('playerDiscovery');

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const [players, setPlayers] = useState<DiscoveryPlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Visibilité de la caller elle-même (pour le bandeau d'incitation).
  const [selfDiscoverable, setSelfDiscoverable] = useState<boolean | null>(
    null
  );

  const runSearch = useCallback(
    (q: string, off: number) => {
      const params = new URLSearchParams({
        q,
        limit: String(PAGE_SIZE),
        offset: String(off),
      });
      return adminFetchJson<SearchResponse>(
        `/api/player/discovery/search?${params.toString()}`,
        { skipAuthRedirect: true }
      );
    },
    [adminFetchJson]
  );

  // Visibilité de la caller (une seule fois, au ready).
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    adminFetchJson<DiscoveryCardData>('/api/player/discovery', {
      skipAuthRedirect: true,
    })
      .then((data) => {
        if (!cancelled) setSelfDiscoverable(data.discoverable);
      })
      .catch((err) => {
        logger.error('[player/discovery] self status error:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, adminFetchJson]);

  // Recherche (première page) à chaque changement de requête débouncée.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    runSearch(debouncedQuery, 0)
      .then((res) => {
        if (cancelled) return;
        setPlayers(res.players);
        setTotal(res.total);
        setOffset(res.players.length);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('[player/discovery] search error:', err);
        setPlayers([]);
        setTotal(0);
        setOffset(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, debouncedQuery, runSearch]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await runSearch(debouncedQuery, offset);
      setPlayers((prev) => [...prev, ...res.players]);
      setTotal(res.total);
      setOffset((prev) => prev + res.players.length);
    } catch (err) {
      logger.error('[player/discovery] load more error:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-5xl mx-auto px-4 py-10 pt-24">
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    // usePlayerSession redirige déjà ; garde-fou pendant la transition.
    return null;
  }

  const canLoadMore = players.length < total;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="max-w-5xl mx-auto px-4 py-10 pt-24 pb-16">
        <div className="mb-8">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <Link href="/player" className="hover:text-white transition">
              &larr; {t.backToDashboard}
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient mt-2">
            {t.pageTitle}
          </h1>
          <p className="text-sm text-gray-400 mt-2 max-w-prose">
            {t.pageSubtitle}
          </p>
        </div>

        {/* Bandeau : la caller n'est pas encore découvrable */}
        {selfDiscoverable === false && (
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-purple-500/40 bg-purple-500/10 px-5 py-4">
            <p className="text-sm text-purple-100">{t.notDiscoverableBanner}</p>
            <Link
              href="/player/profile"
              className="shrink-0 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110"
            >
              {t.notDiscoverableCta}
            </Link>
          </div>
        )}

        {/* Recherche */}
        <div className="mb-6">
          <label htmlFor="discovery-search" className="sr-only">
            {t.searchLabel}
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
            >
              🔍
            </span>
            <input
              id="discovery-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchLabel}
              className="w-full rounded-xl bg-white/5 border border-white/10 pl-11 pr-4 py-3 text-sm placeholder:text-gray-500 focus:border-purple-500/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Résultats */}
        {loading ? (
          <ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="h-32 rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse"
              />
            ))}
          </ul>
        ) : players.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-10 text-center">
            <p className="text-sm font-medium text-white">{t.emptyTitle}</p>
            <p className="mt-1 text-xs text-gray-400 max-w-prose mx-auto">
              {t.emptyHint}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs text-gray-500">
              {format(t.resultsCount, { count: total })}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {players.map((p) => (
                <li key={p.authUserId}>
                  <Link
                    href={`/player/${p.authUserId}`}
                    className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 transition hover:border-purple-500/50 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                  >
                    <div className="flex items-center gap-3">
                      {p.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.avatarUrl}
                          alt=""
                          className="w-12 h-12 rounded-xl border border-purple-500/40 object-cover"
                        />
                      ) : (
                        <span className="flex w-12 h-12 items-center justify-center rounded-xl border border-purple-500/40 bg-purple-600/20 text-base font-bold text-purple-100">
                          {initialsOf(p.displayName)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white group-hover:text-purple-200 transition">
                          {p.displayName}
                        </p>
                        {p.discordUsername && (
                          <p className="truncate text-xs text-gray-500">
                            @{p.discordUsername}
                          </p>
                        )}
                      </div>
                    </div>

                    {p.tagline && (
                      <p className="mt-3 line-clamp-2 text-xs text-gray-400">
                        {p.tagline}
                      </p>
                    )}

                    {p.stats && (
                      <p className="mt-auto pt-3 text-xs text-gray-500 tabular-nums">
                        {format(t.statsLine, {
                          games: p.stats.games,
                          peak: p.stats.peakRating,
                          tenants: p.stats.tenants,
                        })}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            {canLoadMore && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
                >
                  {loadingMore ? t.loading : t.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const playerDiscoverySeo: SeoProps = {
  title: {
    fr: 'Réseau joueuses',
    en: 'Player network',
  },
  description: {
    fr: 'Découvrez les joueuses visibles dans le réseau inter-organisations.',
    en: 'Discover players visible in the cross-organization network.',
  },
  noindex: true,
};

PlayerDiscovery.seo = playerDiscoverySeo;

export default PlayerDiscovery;
