// pages/player/discovery.tsx
// Espace joueur — "Réseau joueuses" (découverte inter-organisations).
//
// Annuaire opt-in GLOBAL, INVISIBLE par défaut, DERRIÈRE LOGIN. On ne liste
// que les joueuses qui ont activé leur visibilité (cf. la section Découverte
// de /player/profile). Trois onglets :
//   - « Découvrir » : recherche débouncée sur /api/player/discovery/search ;
//   - « Je suis »   : GET /api/player/follows?type=following ;
//   - « Mes abonnés »: GET /api/player/follows?type=followers.
// Les trois rendent la même fiche (DirectoryPlayerCard) : avatar, accroche,
// badges d'équipes, compteur d'abonnés, bouton Suivre.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { DiscoveryCardData } from '@/components/player/DiscoveryCard';
import DirectoryPlayerCard, {
  type DirectoryPlayer,
} from '@/components/player/DirectoryPlayerCard';

import { logger } from '../../utils/logger';
import nsPlayerDiscovery from '@/lib/i18n/locales/fr/playerDiscovery';

const PAGE_SIZE = 24;

type DirectoryTab = 'discover' | 'following' | 'followers';

type DirectoryResponse = {
  players: DirectoryPlayer[];
  total: number;
  limit: number;
  offset: number;
};

function PlayerDiscovery() {
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({
    redirectTo: '/login?next=/player/discovery',
  });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const t = useT(nsPlayerDiscovery);

  const [tab, setTab] = useState<DirectoryTab>('discover');

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const [players, setPlayers] = useState<DirectoryPlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Erreur de chargement (première page) vs erreur de « charger plus » : on ne
  // veut pas confondre un échec réseau avec une liste réellement vide.
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // Incrémenté par le bouton « réessayer » pour relancer l'effet de chargement.
  const [reloadKey, setReloadKey] = useState(0);

  // Visibilité de la caller elle-même (pour le bandeau d'incitation).
  const [selfDiscoverable, setSelfDiscoverable] = useState<boolean | null>(
    null
  );

  // Un seul point d'entrée data pour les trois onglets — même forme de réponse.
  const fetchPage = useCallback(
    (which: DirectoryTab, q: string, off: number) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(off),
      });
      if (which === 'discover') {
        params.set('q', q);
        return adminFetchJson<DirectoryResponse>(
          `/api/player/discovery/search?${params.toString()}`,
          { skipAuthRedirect: true }
        );
      }
      params.set('type', which);
      return adminFetchJson<DirectoryResponse>(
        `/api/player/follows?${params.toString()}`,
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

  // Première page à chaque changement d'onglet ou de requête débouncée.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    fetchPage(tab, debouncedQuery, 0)
      .then((res) => {
        if (cancelled) return;
        setPlayers(res.players);
        setTotal(res.total);
        setOffset(res.players.length);
      })
      .catch((err) => {
        if (cancelled) return;
        // Un échec ne doit pas se déguiser en « aucun résultat » : on bascule
        // sur une bannière d'erreur avec retry plutôt qu'un état vide.
        logger.error('[player/discovery] load error:', err);
        setPlayers([]);
        setTotal(0);
        setOffset(0);
        setError(t.listError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, tab, debouncedQuery, fetchPage, reloadKey, t]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetchPage(tab, debouncedQuery, offset);
      setPlayers((prev) => [...prev, ...res.players]);
      setTotal(res.total);
      setOffset((prev) => prev + res.players.length);
    } catch (err) {
      logger.error('[player/discovery] load more error:', err);
      setLoadMoreError(t.loadMoreError);
    } finally {
      setLoadingMore(false);
    }
  };

  // Maj optimiste du compteur d'abonnés local quand on suit/ne suit plus.
  // Sur l'onglet « Je suis », se désabonner retire la fiche de la liste.
  const handleFollowChange = (authUserId: string, following: boolean) => {
    setPlayers((prev) => {
      if (tab === 'following' && !following) {
        return prev.filter((p) => p.authUserId !== authUserId);
      }
      return prev.map((p) =>
        p.authUserId === authUserId
          ? {
              ...p,
              isFollowing: following,
              followerCount: Math.max(
                0,
                p.followerCount + (following ? 1 : -1)
              ),
            }
          : p
      );
    });
    if (tab === 'following' && !following) {
      setTotal((prev) => Math.max(0, prev - 1));
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

  const tabs: { key: DirectoryTab; label: string }[] = [
    { key: 'discover', label: t.tabDiscover },
    { key: 'following', label: t.tabFollowing },
    { key: 'followers', label: t.tabFollowers },
  ];

  const emptyCopy: Record<DirectoryTab, { title: string; hint: string }> = {
    discover: { title: t.emptyTitle, hint: t.emptyHint },
    following: {
      title: t.followingEmptyTitle,
      hint: t.followingEmptyHint,
    },
    followers: {
      title: t.followersEmptyTitle,
      hint: t.followersEmptyHint,
    },
  };

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

        {/* Onglets (segmented control) */}
        <div
          role="tablist"
          aria-label={t.tabsAria}
          className="mb-6 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1"
        >
          {tabs.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`discovery-tab-${key}`}
                aria-selected={active}
                aria-controls="discovery-tabpanel"
                onClick={() => setTab(key)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
                  active
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                    : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id="discovery-tabpanel"
          aria-labelledby={`discovery-tab-${tab}`}
        >
          {/* Recherche — uniquement sur l'onglet Découvrir */}
          {tab === 'discover' && (
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
          )}

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
          ) : error ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-2xl border border-red-500/40 bg-red-500/10 p-8 text-center"
            >
              <p className="text-sm font-medium text-red-100">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-4 inline-flex items-center justify-center rounded-full border border-red-300/40 px-5 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
              >
                {t.retry}
              </button>
            </div>
          ) : players.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-10 text-center">
              <p className="text-sm font-medium text-white">
                {emptyCopy[tab].title}
              </p>
              <p className="mt-1 text-xs text-gray-400 max-w-prose mx-auto">
                {emptyCopy[tab].hint}
              </p>
            </div>
          ) : (
            <>
              {tab === 'discover' && (
                <p className="mb-4 text-xs text-gray-500">
                  {format(t.resultsCount, { count: total })}
                </p>
              )}
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {players.map((p) => (
                  <li key={p.authUserId}>
                    <DirectoryPlayerCard
                      player={p}
                      currentUserId={user.id}
                      onFollowChange={handleFollowChange}
                    />
                  </li>
                ))}
              </ul>

              {loadMoreError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-100"
                >
                  {loadMoreError}
                </div>
              )}

              {canLoadMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-6 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
                  >
                    {loadingMore
                      ? t.loading
                      : loadMoreError
                        ? t.retry
                        : t.loadMore}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
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
