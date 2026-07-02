// pages/leagues/index.tsx
// Page publique : liste des ligues / saisons publiques.
//
// Pré-rendu ISR (getStaticProps revalidate:300) : la liste est lue via l'util
// partagé readPublicLeagues(DEFAULT_TENANT_ID) et passée en props → premier
// rendu SSR pré-rempli, indexable, avec SEO/JSON-LD dynamique. Un fetch client
// rafraîchit ensuite la liste après hydratation. Chaque carte pointe vers
// /leagues/[slug].

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { GetStaticProps, InferGetStaticPropsType } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { League, LeagueStatus } from '@/types/leagues';
import { readPublicLeagues } from '@/utils/leagues/readPublicLeagues';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

const STATUS_LABELS: Record<LeagueStatus, string> = {
  draft: 'Brouillon',
  active: 'En cours',
  finished: 'Terminée',
  archived: 'Archivée',
};

const STATUS_CLASSES: Record<LeagueStatus, string> = {
  draft: 'bg-neutral-500/15 text-neutral-300',
  active: 'bg-emerald-500/15 text-emerald-400',
  finished: 'bg-purple-500/15 text-purple-300',
  archived: 'bg-neutral-500/15 text-neutral-400',
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function periodLabel(league: League): string | null {
  const start = formatDate(league.start_date);
  const end = formatDate(league.end_date);
  if (start && end) return `${start} — ${end}`;
  if (start) return `À partir du ${start}`;
  if (end) return `Jusqu'au ${end}`;
  return null;
}

export default function LeaguesPage({
  initialLeagues,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const hasInitial = initialLeagues.length > 0;
  const [leagues, setLeagues] = useState<League[]>(initialLeagues);
  // Pas de spinner si les props ISR sont pré-remplies : le fetch client ne
  // sert qu'à rafraîchir après hydratation.
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch('/api/leagues');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { leagues: League[] };
      setLeagues(Array.isArray(data.leagues) ? data.leagues : []);
    } catch {
      // On garde l'affichage pré-rempli si le refresh échoue ; on ne montre
      // l'erreur que si rien n'est affiché. On lit l'état courant via la forme
      // fonctionnelle pour garder `load` stable (deps vides → pas de refetch).
      setLeagues((prev) => {
        if (prev.length === 0) setError(true);
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="container mx-auto max-w-5xl px-4 pb-16 pt-24">
        <header className="mb-8 text-center">
          <p className="mb-2 text-xs uppercase tracking-widest text-purple-300">
            Ligues
          </p>
          <h1 className="text-3xl font-bold sm:text-4xl">Ligues & saisons</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-400">
            Suivez les classements cumulés sur plusieurs tournois. Les points
            sont attribués selon le classement final de chaque tournoi de la
            saison.
          </p>
        </header>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState onRetry={() => void load()} />
        ) : leagues.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {leagues.map((league) => {
              const period = periodLabel(league);
              return (
                <li key={league.id}>
                  <Link
                    href={`/leagues/${league.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 transition-colors hover:border-purple-500/40 hover:bg-neutral-900/70"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold group-hover:text-purple-300">
                        {league.name}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_CLASSES[league.status]}`}
                      >
                        {STATUS_LABELS[league.status]}
                      </span>
                    </div>
                    {league.description && (
                      <p className="mb-3 line-clamp-3 text-sm text-neutral-400">
                        {league.description}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      {league.game && (
                        <span className="rounded bg-white/[0.05] px-2 py-0.5">
                          {league.game}
                        </span>
                      )}
                      {period && <span>{period}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/40"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-500/10 text-2xl">
        📅
      </div>
      <h2 className="mb-2 text-lg font-semibold">Aucune ligue publiée</h2>
      <p className="mx-auto max-w-md text-sm text-neutral-400">
        Aucune saison n&apos;est disponible pour le moment. Revenez bientôt !
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
        Impossible de charger les ligues
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
 * sur la propriété statique `LeaguesPage.seo` (repli dégradé).
 *
 * JSON-LD : `ItemList` des ligues publiées.
 * -------------------------------------------------------------------------*/

function buildLeaguesSeo(leagues: League[]): SeoProps {
  const count = leagues.length;
  const description =
    count > 0
      ? `${count} ligue${count > 1 ? 's' : ''} et saison${
          count > 1 ? 's' : ''
        } OW Women’s Cup : classements cumulés des équipes sur plusieurs tournois.`
      : leaguesSeoFallback.description;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Ligues & saisons',
    numberOfItems: count,
    itemListElement: leagues.map((league, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: league.name,
    })),
  };

  return {
    title: 'Ligues & saisons — OW Women’s Cup',
    description,
    jsonLd,
  };
}

const leaguesSeoFallback: SeoProps = {
  title: 'Ligues & saisons — OW Women’s Cup',
  description:
    'Les ligues et saisons OW Women’s Cup : classements cumulés des équipes sur plusieurs tournois.',
};

LeaguesPage.seo = leaguesSeoFallback;

export const getStaticProps: GetStaticProps<{
  initialLeagues: League[];
  seo: SeoProps;
}> = async () => {
  let leagues: League[] = [];
  try {
    const { leagues: list } = await readPublicLeagues(DEFAULT_TENANT_ID);
    leagues = list;
  } catch {
    // En cas d'échec DB au build/revalidate, on rend une page vide indexable ;
    // le fetch client rechargera. Revalidation rapprochée pour se rattraper.
    return {
      props: { initialLeagues: [], seo: leaguesSeoFallback },
      revalidate: 30,
    };
  }

  return {
    props: { initialLeagues: leagues, seo: buildLeaguesSeo(leagues) },
    revalidate: 300,
  };
};
