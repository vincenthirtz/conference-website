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

type FetchState =
  | { status: 'loading' }
  | { status: 'notfound' }
  | { status: 'error' }
  | { status: 'ok'; data: LeagueDetailResponse };

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
  const fetcher = useCallback(async (): Promise<LeagueDetailResponse | null> => {
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
          ← Retour aux ligues
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
  const { league, standings, tournaments } = data;
  const period = periodLabel(league);

  return (
    <>
      <header className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{league.name}</h1>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_CLASSES[league.status]}`}
          >
            {STATUS_LABELS[league.status]}
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-purple-300">
          Classement
        </h2>
        <Standings standings={standings} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-purple-300">
          Tournois de la saison
        </h2>
        <Tournaments tournaments={tournaments} />
      </section>
    </>
  );
}

function Standings({ standings }: { standings: LeagueStandingPublic[] }) {
  if (standings.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 py-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-xl">
          📊
        </div>
        <p className="text-sm text-neutral-400">
          Aucun classement disponible pour le moment. Les points apparaîtront
          dès qu&apos;un tournoi de la saison sera terminé.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
            <tr>
              <th className="w-16 px-4 py-3 text-left">Rang</th>
              <th className="px-4 py-3 text-left">Équipe</th>
              <th className="px-4 py-3 text-right">Points</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">
                Tournois
              </th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">
                Meilleur rang
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
              const name = s.teamName ?? 'Équipe inconnue';
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
                          className="font-medium hover:text-purple-300"
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
  if (tournaments.length === 0) {
    return (
      <p className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-400">
        Aucun tournoi rattaché à cette saison pour le moment.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-800/60 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
      {tournaments.map((t) => {
        const name = t.name ?? 'Tournoi';
        const inner = (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate text-neutral-200">{name}</span>
            {t.weight !== 1 && (
              <span className="shrink-0 rounded-full bg-purple-500/15 px-2.5 py-1 text-xs font-semibold text-purple-300">
                ×{t.weight}
              </span>
            )}
          </div>
        );
        return (
          <li key={t.id}>
            {t.slug ? (
              <Link
                href={`/tournament/${t.slug}`}
                className="block text-sm transition-colors hover:bg-white/[0.03] hover:text-purple-300"
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
  return (
    <section className="py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-2xl">
        🔍
      </div>
      <h1 className="mb-2 text-xl font-semibold">Ligue introuvable</h1>
      <p className="mx-auto mb-6 max-w-md text-sm text-neutral-400">
        Cette ligue n&apos;existe pas ou n&apos;est pas publique.
      </p>
      <Link
        href="/leagues"
        className="rounded-md bg-purple-500 px-4 py-2 text-sm font-semibold transition-colors hover:bg-purple-400"
      >
        Voir les ligues
      </Link>
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
      <h1 className="mb-2 text-xl font-semibold">
        Impossible de charger cette ligue
      </h1>
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
  const period = periodLabel(league);
  const statusLabel = STATUS_LABELS[league.status];

  const descriptionParts = [
    `Classement cumulé de la saison ${league.name}`,
    period ? `(${period})` : null,
    `— ${statusLabel.toLowerCase()}.`,
    standings.length > 0
      ? `${standings.length} équipe${standings.length > 1 ? 's' : ''} classée${
          standings.length > 1 ? 's' : ''
        }.`
      : null,
  ].filter(Boolean);

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
    title: `${league.name} — classement`,
    description: descriptionParts.join(' '),
    jsonLd,
  };
}

const leagueDetailSeoFallback: SeoProps = {
  title: 'Ligue',
  description:
    'Classement cumulé des équipes et tournois de la saison OW Women’s Cup.',
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
