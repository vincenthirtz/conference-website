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
import { useT } from '@/lib/i18n/useT';

type LeaguesIndexDict = ReturnType<typeof useT<'leaguesIndex'>>;

const getStatusLabels = (
  t: LeaguesIndexDict
): Record<LeagueStatus, string> => ({
  draft: t.statusDraft,
  active: t.statusActive,
  finished: t.statusFinished,
  archived: t.statusArchived,
});

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
  const t = useT('leaguesIndex');
  const statusLabels = getStatusLabels(t);
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
        <header className="mb-8 flex flex-col items-center text-center">
          <p className="mb-2 text-xs uppercase tracking-widest text-[var(--color-violet-light)]">
            {t.eyebrow}
          </p>
          <h1 className="text-brand-gradient text-3xl font-bold sm:text-4xl">
            {t.heading}
          </h1>
          <span className="brand-rule mt-3" aria-hidden />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-400">
            {t.subtitle}
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
                    className="group card-brand flex h-full flex-col rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 transition-colors hover:bg-neutral-900/70"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold group-hover:text-[var(--color-violet-light)]">
                        {league.name}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_CLASSES[league.status]}`}
                      >
                        {statusLabels[league.status]}
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
  const t = useT('leaguesIndex');
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-violet)]/10 text-2xl">
        📅
      </div>
      <h2 className="mb-2 text-lg font-semibold">{t.emptyHeading}</h2>
      <p className="mx-auto max-w-md text-sm text-neutral-400">{t.emptyBody}</p>
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT('leaguesIndex');
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
      <h2 className="mb-2 text-xl font-semibold">{t.errorHeading}</h2>
      <p className="mb-6 text-neutral-400">{t.errorBody}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-[var(--color-violet)] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
      >
        {t.retry}
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
  const plural = count > 1;
  const descriptionFr =
    count > 0
      ? `${count} ligue${plural ? 's' : ''} et saison${
          plural ? 's' : ''
        } OW Women’s Cup : classements cumulés des équipes sur plusieurs tournois.`
      : leaguesSeoFallbackFr;
  const descriptionEn =
    count > 0
      ? `${count} OW Women’s Cup league${plural ? 's' : ''} and season${
          plural ? 's' : ''
        }: aggregated team standings across multiple tournaments.`
      : leaguesSeoFallbackEn;

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
    title: {
      fr: 'Ligues & saisons — OW Women’s Cup',
      en: 'Leagues & seasons — OW Women’s Cup',
    },
    description: { fr: descriptionFr, en: descriptionEn },
    jsonLd,
  };
}

const leaguesSeoFallbackFr =
  'Les ligues et saisons OW Women’s Cup : classements cumulés des équipes sur plusieurs tournois.';
const leaguesSeoFallbackEn =
  'OW Women’s Cup leagues and seasons: aggregated team standings across multiple tournaments.';

const leaguesSeoFallback: SeoProps = {
  title: {
    fr: 'Ligues & saisons — OW Women’s Cup',
    en: 'Leagues & seasons — OW Women’s Cup',
  },
  description: { fr: leaguesSeoFallbackFr, en: leaguesSeoFallbackEn },
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
