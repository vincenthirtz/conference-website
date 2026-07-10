// pages/leagues/[slug].tsx
// Page publique : détail d'une ligue / saison — en-tête, table des standings
// (classement cumulé des équipes) et liste des tournois comptant dans la
// saison (avec leur poids si ≠ 1).
//
// Pré-rendu ISR (getStaticPaths fallback:'blocking' + getStaticProps
// revalidate:300) via l'util partagé readLeagueDetail(DEFAULT_TENANT_ID) —
// contenu indexable, SEO/JSON-LD par-entité. Un fetch client rafraîchit
// ensuite les standings après hydratation. 404 = notFound.

import { useCallback, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIsrRefresh } from '@/hooks/useIsrRefresh';
import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type {
  LeagueDetailResponse,
  League,
  LeagueStatus,
  LeagueStandingPublic,
  LeagueTournamentRef,
} from '@/types/leagues';
import { readLeagueDetail } from '@/utils/leagues/readLeagueDetail';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT } from '@/lib/i18n/useT';
import { useLang, type Lang } from '@/lib/i18n/LanguageProvider';
import { localeTag } from '@/lib/i18n/useLocale';

type LeagueDetailDict = ReturnType<typeof useT<'leagueDetail'>>;

const getStatusLabels = (
  t: LeagueDetailDict
): Record<LeagueStatus, string> => ({
  draft: t.statusDraft,
  active: t.statusActive,
  finished: t.statusFinished,
  archived: t.statusArchived,
});

type FetchState =
  | { status: 'loading' }
  | { status: 'notfound' }
  | { status: 'error' }
  | { status: 'ok'; data: LeagueDetailResponse };

// Version francophone figée : utilisée uniquement par le SEO (buildLeagueSeo,
// hors contexte de hook). Le rendu visible passe par getStatusLabels(t).
const STATUS_LABELS: Record<LeagueStatus, string> = {
  draft: 'Brouillon',
  active: 'En cours',
  finished: 'Terminée',
  archived: 'Archivée',
};

// Pendant anglophone de STATUS_LABELS : utilisé uniquement par le SEO
// (buildLeagueSeo, hors contexte de hook).
const STATUS_LABELS_EN: Record<LeagueStatus, string> = {
  draft: 'Draft',
  active: 'Ongoing',
  finished: 'Completed',
  archived: 'Archived',
};

const STATUS_CLASSES: Record<LeagueStatus, string> = {
  draft: 'bg-neutral-500/15 text-neutral-300',
  active: 'bg-emerald-500/15 text-emerald-400',
  finished: 'bg-purple-500/15 text-purple-300',
  archived: 'bg-neutral-500/15 text-neutral-400',
};

function formatDate(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(localeTag(lang), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function periodLabel(league: League, lang: Lang): string | null {
  const start = formatDate(league.start_date, lang);
  const end = formatDate(league.end_date, lang);
  if (start && end) return `${start} — ${end}`;
  if (start) return lang === 'fr' ? `À partir du ${start}` : `From ${start}`;
  if (end) return lang === 'fr' ? `Jusqu'au ${end}` : `Until ${end}`;
  return null;
}

function rankClass(rank: number): string {
  if (rank === 1) return 'text-amber-300';
  if (rank === 2) return 'text-neutral-200';
  if (rank === 3) return 'text-orange-400';
  return 'text-neutral-400';
}

export default function LeagueDetailPage({
  league: initial,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const router = useRouter();
  const { slug } = router.query;
  const s = typeof slug === 'string' ? slug : '';

  // 404 traité à part du hook générique (état métier distinct de l'erreur
  // réseau). Un refresh renvoyant 404 masque le détail pré-rempli.
  const [notFound, setNotFound] = useState(false);

  // Premier rendu = données pré-remplies par l'ISR (getStaticProps). Le fetch
  // client ne se déclenche qu'en fallback ISR (détail absent des props) ou au
  // retour de focus ; il ne double PAS la lecture des props ISR fraîches.
  const fetcher =
    useCallback(async (): Promise<LeagueDetailResponse | null> => {
      if (!s) return null;
      const res = await fetch(`/api/leagues/${encodeURIComponent(s)}`);
      if (res.status === 404) {
        setNotFound(true);
        return null;
      }
      setNotFound(false);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as LeagueDetailResponse;
    }, [s]);

  const { data, error, refresh } = useIsrRefresh<LeagueDetailResponse>({
    initial: initial ?? null,
    fetcher,
    when: router.isReady && !!s,
  });

  const t = useT('leagueDetail');
  const state: FetchState = notFound
    ? { status: 'notfound' }
    : data
      ? { status: 'ok', data }
      : error
        ? { status: 'error' }
        : { status: 'loading' };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6">
        <Link
          href="/leagues"
          className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
        >
          {t.backToLeagues}
        </Link>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'notfound' && <NotFoundState />}
        {state.status === 'error' && <ErrorState onRetry={refresh} />}
        {state.status === 'ok' && <Detail data={state.data} />}
      </main>
    </div>
  );
}

function Detail({ data }: { data: LeagueDetailResponse }) {
  const t = useT('leagueDetail');
  const { lang } = useLang();
  const statusLabels = getStatusLabels(t);
  const { league, standings, tournaments } = data;
  const period = periodLabel(league, lang);

  return (
    <>
      <header className="card-brand rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-brand-gradient text-2xl font-bold sm:text-3xl">
            {league.name}
          </h1>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_CLASSES[league.status]}`}
          >
            {statusLabels[league.status]}
          </span>
        </div>
        {league.description && (
          <p className="mb-3 text-sm text-neutral-300">{league.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          {league.game && (
            <span className="rounded bg-white/[0.05] px-2 py-0.5">
              {league.game}
            </span>
          )}
          {period && <span>{period}</span>}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-violet-light)]">
          {t.standingsHeading}
        </h2>
        <Standings standings={standings} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-violet-light)]">
          {t.tournamentsHeading}
        </h2>
        <Tournaments tournaments={tournaments} />
      </section>
    </>
  );
}

function Standings({ standings }: { standings: LeagueStandingPublic[] }) {
  const t = useT('leagueDetail');
  if (standings.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 py-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-violet)]/10 text-xl">
          📊
        </div>
        <p className="text-sm text-neutral-400">{t.standingsEmpty}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
            <tr>
              <th scope="col" className="w-16 px-4 py-3 text-left">{t.colRank}</th>
              <th scope="col" className="px-4 py-3 text-left">{t.colTeam}</th>
              <th scope="col" className="px-4 py-3 text-right">{t.colPoints}</th>
              <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">
                {t.colTournaments}
              </th>
              <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">
                {t.colBestRank}
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
              const name = s.teamName ?? t.unknownTeam;
              return (
                <tr
                  key={s.teamId}
                  className="border-t border-neutral-800/60 transition-colors hover:bg-white/[0.03]"
                >
                  <td
                    className={`px-4 py-3 font-mono font-semibold ${rankClass(s.rank)}`}
                  >
                    #{s.rank}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {s.logoUrl ? (
                        <Image
                          src={s.logoUrl}
                          alt=""
                          width={24}
                          height={24}
                          className="h-6 w-6 rounded object-contain"
                        />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-neutral-800 text-[10px] font-bold uppercase">
                          {name[0]}
                        </span>
                      )}
                      {s.teamSlug ? (
                        <Link
                          href={`/team/${s.teamSlug}`}
                          className="font-medium hover:text-[var(--color-violet-light)]"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="font-medium">{name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {s.points}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-neutral-300 sm:table-cell">
                    {s.tournamentsCounted}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-neutral-300 sm:table-cell">
                    {s.bestRank !== null ? `#${s.bestRank}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tournaments({ tournaments }: { tournaments: LeagueTournamentRef[] }) {
  const t = useT('leagueDetail');
  if (tournaments.length === 0) {
    return (
      <p className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-400">
        {t.tournamentsEmpty}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-800/60 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
      {tournaments.map((tr) => {
        const name = tr.name ?? t.tournamentFallback;
        const inner = (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate text-neutral-200">{name}</span>
            {tr.weight !== 1 && (
              <span className="shrink-0 rounded-full bg-[var(--color-violet)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--color-violet-light)]">
                ×{tr.weight}
              </span>
            )}
          </div>
        );
        return (
          <li key={tr.id}>
            {tr.slug ? (
              <Link
                href={`/tournament/${tr.slug}`}
                className="block text-sm transition-colors hover:bg-white/[0.03] hover:text-[var(--color-violet-light)]"
              >
                {inner}
              </Link>
            ) : (
              <div className="text-sm">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LoadingState() {
  return (
    <div className="space-y-8">
      <div className="h-32 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/40" />
      <div className="h-64 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/40" />
    </div>
  );
}

function NotFoundState() {
  const t = useT('leagueDetail');
  return (
    <section className="py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-2xl">
        🔍
      </div>
      <h1 className="mb-2 text-xl font-semibold">{t.notFoundHeading}</h1>
      <p className="mx-auto mb-6 max-w-md text-sm text-neutral-400">
        {t.notFoundBody}
      </p>
      <Link
        href="/leagues"
        className="rounded-md bg-[var(--color-violet)] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
      >
        {t.viewLeagues}
      </Link>
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT('leagueDetail');
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
      <h1 className="mb-2 text-xl font-semibold">{t.errorHeading}</h1>
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
 * SEO dynamique par-entité
 *
 * `getStaticProps` renvoie `props.seo` (SeoProps), privilégié par `_app.tsx`
 * sur la propriété statique `Component.seo`. La prop statique reste comme
 * repli dégradé.
 *
 * Choix JSON-LD : `ItemList` des standings plutôt que `SportsEvent`. Une
 * league OW Women's Cup est une *saison* cumulant plusieurs tournois — pas un
 * évènement sportif unique daté. `ItemList` (classement ordonné d'équipes)
 * décrit fidèlement le contenu principal de la page (la table de standings) et
 * se prête aux rich results de type liste.
 * -------------------------------------------------------------------------*/

function buildLeagueSeo(data: LeagueDetailResponse): SeoProps {
  const { league, standings } = data;
  const periodFr = periodLabel(league, 'fr');
  const periodEn = periodLabel(league, 'en');
  const statusLabelFr = STATUS_LABELS[league.status];
  const statusLabelEn = STATUS_LABELS_EN[league.status];
  const plural = standings.length > 1;

  const descriptionFr = [
    `Classement cumulé de la saison ${league.name}`,
    periodFr ? `(${periodFr})` : null,
    `— ${statusLabelFr.toLowerCase()}.`,
    standings.length > 0
      ? `${standings.length} équipe${plural ? 's' : ''} classée${
          plural ? 's' : ''
        }.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  const descriptionEn = [
    `Aggregated standings for the ${league.name} season`,
    periodEn ? `(${periodEn})` : null,
    `— ${statusLabelEn.toLowerCase()}.`,
    standings.length > 0
      ? `${standings.length} ranked team${plural ? 's' : ''}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Classement — ${league.name}`,
    ...(league.description ? { description: league.description } : {}),
    numberOfItems: standings.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: standings.map((s) => ({
      '@type': 'ListItem',
      position: s.rank,
      name: s.teamName ?? 'Équipe',
    })),
  };

  return {
    title: {
      fr: `${league.name} — classement`,
      en: `${league.name} — standings`,
    },
    description: { fr: descriptionFr, en: descriptionEn },
    jsonLd,
  };
}

const leagueDetailSeoFallback: SeoProps = {
  title: { fr: 'Ligue', en: 'League' },
  description: {
    fr: 'Classement cumulé des équipes et tournois de la saison OW Women’s Cup.',
    en: 'Aggregated team and tournament standings for the OW Women’s Cup season.',
  },
};

LeagueDetailPage.seo = leagueDetailSeoFallback;

export const getStaticPaths: GetStaticPaths = async () => {
  // Génération à la demande (fallback blocking) : aucun chemin pré-généré au
  // build, puis cache / revalidation.
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<{
  league: LeagueDetailResponse;
  seo: SeoProps;
}> = async (ctx) => {
  const rawSlug = ctx.params?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug || typeof slug !== 'string') {
    return { notFound: true, revalidate: 300 };
  }

  let detail: LeagueDetailResponse | null;
  try {
    detail = await readLeagueDetail(slug, DEFAULT_TENANT_ID);
  } catch {
    return { notFound: true, revalidate: 30 };
  }

  if (!detail) {
    return { notFound: true, revalidate: 300 };
  }

  return {
    props: { league: detail, seo: buildLeagueSeo(detail) },
    revalidate: 300,
  };
};
