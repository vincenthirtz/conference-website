// pages/tournaments.tsx
// Page publique listant tous les tournois (passés, en cours, à venir)

import { GetStaticProps } from 'next';
import Link from 'next/link';
import { useMemo } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { supabaseAdmin } from '@/utils/supabase';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { logger } from '../utils/logger';
type Tournament = {
  id: string;
  name: string;
  slug: string | null;
  short_name: string | null;
  game: string | null;
  status: string;
  format: string | null;
  start_date: string | null;
  end_date: string | null;
  max_teams: number | null;
};

type TournamentsPageProps = {
  tournaments: Tournament[];
};

export const getStaticProps: GetStaticProps<
  TournamentsPageProps
> = async () => {
  if (!supabaseAdmin) {
    return { props: { tournaments: [] }, revalidate: 60 };
  }

  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select(
      `
      id,
      name,
      slug,
      short_name,
      game,
      status,
      format,
      start_date,
      end_date,
      max_teams
    `
    )
    .in('status', ['published', 'running', 'completed'])
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[tournaments] fetch error:', error);
    return { props: { tournaments: [] }, revalidate: 60 };
  }

  return {
    props: {
      tournaments: (data || []) as Tournament[],
    },
    revalidate: 600, // Rebuild every 10 minutes
  };
};

function TournamentsPage({ tournaments }: TournamentsPageProps) {
  const now = useMemo(() => new Date(), []);

  // Classifier les tournois
  const { running, upcoming, past } = useMemo(() => {
    const running: Tournament[] = [];
    const upcoming: Tournament[] = [];
    const past: Tournament[] = [];

    for (const t of tournaments) {
      // Tournoi en cours si status = running OU (published et dates incluent aujourd'hui)
      if (t.status === 'running') {
        running.push(t);
        continue;
      }

      if (t.status === 'completed') {
        past.push(t);
        continue;
      }

      // Pour les published, vérifier les dates
      if (t.start_date) {
        const startDate = new Date(t.start_date);
        const endDate = t.end_date ? new Date(t.end_date) : startDate;

        if (now < startDate) {
          upcoming.push(t);
        } else if (now > endDate) {
          past.push(t);
        } else {
          running.push(t);
        }
      } else {
        // Pas de date, on considère comme à venir
        upcoming.push(t);
      }
    }

    // Trier upcoming par date croissante (le plus proche en premier)
    upcoming.sort((a, b) => {
      const da = a.start_date ? new Date(a.start_date).getTime() : Infinity;
      const db = b.start_date ? new Date(b.start_date).getTime() : Infinity;
      return da - db;
    });

    return { running, upcoming, past };
  }, [tournaments, now]);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
          {/* Header */}
          <section className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300 mb-4">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                Compétition
              </span>
              <span>Overwatch</span>
            </div>

            <Heading
              typeStyle="heading-lg"
              level="h1"
              className="text-gradient mb-4"
            >
              Tous les tournois
            </Heading>

            <Paragraph
              typeStyle="body-lg"
              textColor="text-gray-300"
              className="max-w-2xl mx-auto"
            >
              Retrouvez l&apos;ensemble des compétitions OW Women&apos;s Cup.
              Suivez les brackets, consultez les résultats et découvrez les
              équipes participantes.
            </Paragraph>
          </section>

          {/* Tournois en cours */}
          {running.length > 0 && (
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-xl font-bold">En cours</h2>
                <span className="text-sm text-gray-400">
                  {running.length} tournoi{running.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {running.map((t) => (
                  <TournamentCard key={t.id} tournament={t} status="running" />
                ))}
              </div>
            </section>
          )}

          {/* Tournois à venir */}
          {upcoming.length > 0 && (
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <h2 className="text-xl font-bold">À venir</h2>
                <span className="text-sm text-gray-400">
                  {upcoming.length} tournoi{upcoming.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((t) => (
                  <TournamentCard key={t.id} tournament={t} status="upcoming" />
                ))}
              </div>
            </section>
          )}

          {/* Tournois passés */}
          {past.length > 0 && (
            <section className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-3 h-3 rounded-full bg-gray-500" />
                <h2 className="text-xl font-bold">Terminés</h2>
                <span className="text-sm text-gray-400">
                  {past.length} tournoi{past.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {past.map((t) => (
                  <TournamentCard key={t.id} tournament={t} status="past" />
                ))}
              </div>
            </section>
          )}

          {/* Aucun tournoi */}
          {tournaments.length === 0 && (
            <section className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2">
                Aucun tournoi disponible
              </h2>
              <p className="text-gray-400">
                Les prochains tournois seront annoncés bientôt.
              </p>
            </section>
          )}
        </main>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
 * Components locaux
 * ────────────────────────────────────────────*/

type TournamentCardProps = {
  tournament: Tournament;
  status: 'running' | 'upcoming' | 'past';
};

function TournamentCard({ tournament, status }: TournamentCardProps) {
  const dateLabel = formatTournamentDates(
    tournament.start_date,
    tournament.end_date
  );

  const statusConfig = {
    running: {
      label: 'En cours',
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500/40',
      text: 'text-emerald-300',
    },
    upcoming: {
      label: 'À venir',
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/40',
      text: 'text-amber-300',
    },
    past: {
      label: 'Terminé',
      bg: 'bg-gray-500/20',
      border: 'border-gray-500/40',
      text: 'text-gray-300',
    },
  };

  const config = statusConfig[status];
  const href = `/tournament/${tournament.slug || tournament.id}`;

  return (
    <Link href={href}>
      <div className="group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden hover:border-purple-400/50 transition-all cursor-pointer">
        {/* Banner */}
        <div className="relative h-32 bg-gradient-to-br from-purple-900/40 to-pink-900/40">
          {/* Status badge */}
          <div className="absolute top-3 right-3">
            <span
              className={`px-2 py-1 rounded-full text-[10px] font-semibold ${config.bg} ${config.border} ${config.text} border`}
            >
              {config.label}
            </span>
          </div>

          {/* Short name or initials */}
          <div className="absolute bottom-3 left-3">
            <div className="w-12 h-12 rounded-xl bg-black/60 border border-white/20 flex items-center justify-center">
              <span className="text-sm font-bold text-white/80">
                {(tournament.short_name || tournament.name)
                  .slice(0, 3)
                  .toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-white mb-1 line-clamp-1 group-hover:text-purple-200 transition-colors">
            {tournament.name}
          </h3>

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-3">
            {dateLabel && <span>{dateLabel}</span>}
            {tournament.format && (
              <>
                <span className="text-gray-600">·</span>
                <span>{tournament.format}</span>
              </>
            )}
            {tournament.game && (
              <>
                <span className="text-gray-600">·</span>
                <span>{tournament.game}</span>
              </>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              {tournament.max_teams && (
                <span className="px-2 py-1 rounded-lg bg-white/5 text-gray-300">
                  {tournament.max_teams} équipes max
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {status !== 'past' && (
                <Link
                  href={`/team/create?tournament=${tournament.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-gradient-to-r from-pink-500 to-orange-400 text-black hover:from-pink-400 hover:to-orange-300 transition-colors">
                    S&apos;inscrire
                  </span>
                </Link>
              )}
              <span className="text-xs text-purple-300 group-hover:text-purple-200 transition-colors">
                Voir →
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

const tournamentsSeo: SeoProps = {
  title: 'Tournois Overwatch féminins — toutes les éditions',
  description:
    "Découvrez tous les tournois OW Women's Cup : passés, en cours et à venir. Brackets, résultats et équipes.",
};

TournamentsPage.seo = tournamentsSeo;

export default TournamentsPage;

function formatTournamentDates(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start && !end) return null;

  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
  };

  const optsWithYear: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };

  const currentYear = new Date().getFullYear();

  if (start && end) {
    const s = new Date(start);
    const e = new Date(end);

    const useYear = s.getFullYear() !== currentYear;
    const format = useYear ? optsWithYear : opts;

    if (s.getTime() === e.getTime()) {
      return s.toLocaleDateString('fr-FR', format);
    }
    return `${s.toLocaleDateString('fr-FR', opts)} - ${e.toLocaleDateString('fr-FR', format)}`;
  }

  if (start) {
    const s = new Date(start);
    const useYear = s.getFullYear() !== currentYear;
    return s.toLocaleDateString('fr-FR', useYear ? optsWithYear : opts);
  }

  const e = new Date(end!);
  const useYear = e.getFullYear() !== currentYear;
  return `Jusqu'au ${e.toLocaleDateString('fr-FR', useYear ? optsWithYear : opts)}`;
}
