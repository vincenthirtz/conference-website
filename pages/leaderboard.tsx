// pages/leaderboard.tsx
// Page publique : classement des joueuses par rating (Glicko-2).
//
// Pré-rendu ISR (getStaticProps revalidate:300) : la première page (top 50)
// est lue via l'util partagé readLeaderboard(DEFAULT_TENANT_ID) et passée en
// props → premier rendu SSR pré-rempli, indexable, avec SEO/JSON-LD dynamique.
// La pagination "voir plus" (offset > 0) reste en fetch client via
// GET /api/players/leaderboard. Chaque ligne pointe vers /player/[userId].

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { GetStaticProps, InferGetStaticPropsType } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { LeaderboardPlayer } from '@/types/rating';
import { readLeaderboard } from '@/utils/rating/readLeaderboard';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

const PAGE_SIZE = 50;
const JSONLD_TOP_N = 10;

function playerLabel(p: LeaderboardPlayer): string {
  return p.displayName ?? p.battleTag ?? 'Joueuse inconnue';
}

function ratingBadge(rank: number): string {
  if (rank === 1) return 'text-amber-300';
  if (rank === 2) return 'text-neutral-200';
  if (rank === 3) return 'text-orange-400';
  return 'text-neutral-400';
}

export default function LeaderboardPage({
  initialPlayers,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const hasInitial = initialPlayers.length > 0;
  const [players, setPlayers] = useState<LeaderboardPlayer[]>(initialPlayers);
  // Si les props ISR sont pré-remplies, on ne rétrograde pas en spinner : le
  // fetch client ne sert qu'à rafraîchir après hydratation.
  const [loading, setLoading] = useState(!hasInitial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(initialPlayers.length);
  const [hasMore, setHasMore] = useState(initialPlayers.length === PAGE_SIZE);

  const fetchPage = useCallback(async (nextOffset: number) => {
    const isFirst = nextOffset === 0;
    if (isFirst) {
      setError(false);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await fetch(
        `/api/players/leaderboard?limit=${PAGE_SIZE}&offset=${nextOffset}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { players: LeaderboardPlayer[] };
      const batch = Array.isArray(data.players) ? data.players : [];

      setPlayers((prev) => (isFirst ? batch : [...prev, ...batch]));
      setHasMore(batch.length === PAGE_SIZE);
      setOffset(nextOffset + batch.length);
    } catch {
      // On garde l'affichage pré-rempli si le refresh échoue ; on ne montre
      // l'erreur que si la première page n'a rien à afficher. On lit l'état
      // courant via la forme fonctionnelle pour garder fetchPage stable
      // (deps vides → pas de refetch en boucle).
      if (isFirst) {
        setPlayers((prev) => {
          if (prev.length === 0) setError(true);
          return prev;
        });
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Rafraîchit la première page au montage. Si les props ISR existent, le
  // rendu reste pré-rempli pendant le refresh (pas de spinner).
  useEffect(() => {
    void fetchPage(0);
  }, [fetchPage]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="container mx-auto max-w-5xl px-4 pb-16 pt-24">
        <header className="mb-8 text-center">
          <p className="mb-2 text-xs uppercase tracking-widest text-purple-300">
            Classement
          </p>
          <h1 className="text-3xl font-bold sm:text-4xl">
            Classement des joueuses
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-400">
            Rating calculé à partir des matchs officiels. L&apos;incertitude
            (RD) reflète la fiabilité du score : plus elle est basse, plus le
            rating est stable.
          </p>
        </header>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState onRetry={() => void fetchPage(0)} />
        ) : players.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
                    <tr>
                      <th className="w-16 px-4 py-3 text-left">Rang</th>
                      <th className="px-4 py-3 text-left">Joueuse</th>
                      <th className="px-4 py-3 text-right">Rating</th>
                      <th className="hidden px-4 py-3 text-right sm:table-cell">
                        Matchs
                      </th>
                      <th className="px-4 py-3 text-right">V - D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => {
                      const label = playerLabel(p);
                      return (
                        <tr
                          key={p.userId}
                          className="border-t border-neutral-800/60 transition-colors hover:bg-white/[0.03]"
                        >
                          <td
                            className={`px-4 py-3 font-mono font-semibold ${ratingBadge(
                              p.rank
                            )}`}
                          >
                            #{p.rank}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/player/${p.userId}`}
                              className="flex items-center gap-3 hover:text-purple-300"
                            >
                              {p.avatarUrl ? (
                                <Image
                                  src={p.avatarUrl}
                                  alt=""
                                  width={32}
                                  height={32}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold uppercase">
                                  {label[0]}
                                </span>
                              )}
                              <span className="flex flex-col leading-tight">
                                <span className="font-medium">{label}</span>
                                {p.displayName && p.battleTag ? (
                                  <span className="text-xs text-neutral-500">
                                    {p.battleTag}
                                  </span>
                                ) : null}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold">
                              {Math.round(p.rating)}
                            </span>
                            <span className="ml-1 text-xs text-neutral-500">
                              ± {Math.round(p.rd)}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 text-right text-neutral-300 sm:table-cell">
                            {p.gamesPlayed}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-emerald-400">{p.wins}</span>
                            <span className="text-neutral-600"> - </span>
                            <span className="text-rose-400">{p.losses}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => void fetchPage(offset)}
                  disabled={loadingMore}
                  className="rounded-md bg-purple-500 px-6 py-2 text-sm font-semibold transition-colors hover:bg-purple-400 disabled:opacity-50"
                >
                  {loadingMore ? 'Chargement…' : 'Voir plus'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-t border-neutral-800/60 px-4 py-4 first:border-t-0"
        >
          <div className="h-4 w-8 animate-pulse rounded bg-neutral-800" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-800" />
          <div className="h-4 flex-1 animate-pulse rounded bg-neutral-800" />
          <div className="h-4 w-16 animate-pulse rounded bg-neutral-800" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-500/10 text-2xl">
        🏆
      </div>
      <h2 className="mb-2 text-lg font-semibold">Aucune joueuse classée</h2>
      <p className="mx-auto max-w-md text-sm text-neutral-400">
        Le classement se remplira dès que des matchs officiels auront été joués.
        Revenez bientôt !
      </p>
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="py-16 text-center" role="alert">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
        <svg
          className="h-8 w-8 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-semibold">
        Impossible de charger le classement
      </h2>
      <p className="mb-6 text-neutral-400">
        Une erreur est survenue. Réessayez dans quelques instants.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-purple-500 px-4 py-2 text-sm font-semibold transition-colors hover:bg-purple-400"
      >
        Réessayer
      </button>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * SEO dynamique
 *
 * `getStaticProps` renvoie `props.seo` (SeoProps), privilégié par `_app.tsx`
 * sur la propriété statique `LeaderboardPage.seo` (repli dégradé).
 *
 * JSON-LD : `ItemList` du top N (classement ordonné de joueuses) — décrit
 * fidèlement le contenu principal de la page et se prête aux rich results de
 * type liste.
 * -------------------------------------------------------------------------*/

function buildLeaderboardSeo(players: LeaderboardPlayer[]): SeoProps {
  const count = players.length;
  const description =
    count > 0
      ? `Classement des joueuses par rating : ${count} joueuse${
          count > 1 ? 's' : ''
        } classée${count > 1 ? 's' : ''}. Ratings, matchs joués et bilan victoires-défaites, calculés sur les matchs officiels.`
      : leaderboardSeoFallback.description;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Classement des joueuses',
    numberOfItems: count,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: players.slice(0, JSONLD_TOP_N).map((p) => ({
      '@type': 'ListItem',
      position: p.rank,
      name: playerLabel(p),
    })),
  };

  return {
    title: 'Classement des joueuses — rating',
    description,
    jsonLd,
  };
}

const leaderboardSeoFallback: SeoProps = {
  title: 'Classement des joueuses — rating',
  description:
    'Classement des joueuses par rating : ratings, matchs joués et bilan victoires-défaites, calculés sur les matchs officiels.',
};

LeaderboardPage.seo = leaderboardSeoFallback;

export const getStaticProps: GetStaticProps<{
  initialPlayers: LeaderboardPlayer[];
  seo: SeoProps;
}> = async () => {
  let players: LeaderboardPlayer[] = [];
  try {
    const { players: firstPage } = await readLeaderboard(
      DEFAULT_TENANT_ID,
      PAGE_SIZE,
      0
    );
    players = firstPage;
  } catch {
    // En cas d'échec DB au build/revalidate, on rend une page vide indexable ;
    // le fetch client rechargera. Revalidation rapprochée pour se rattraper.
    return {
      props: { initialPlayers: [], seo: leaderboardSeoFallback },
      revalidate: 30,
    };
  }

  return {
    props: { initialPlayers: players, seo: buildLeaderboardSeo(players) },
    revalidate: 300,
  };
};
