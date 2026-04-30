import Link from 'next/link';
import type { JSX } from 'react';
import Paragraph from '@/components/Typography/paragraph';

export type UpcomingTournament = {
  id: string;
  name: string;
  slug: string | null;
  shortName: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  format: string | null;
  maxTeams: number | null;
  teamCount: number;
};

type TournamentCardProps = {
  tournament: UpcomingTournament;
};

function formatRange(start: string | null, end: string | null) {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const fmtFull = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
  if (!endDate || endDate.getTime() === startDate.getTime()) {
    return fmtFull.format(startDate);
  }
  const sameMonth =
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();
  if (sameMonth) {
    return `${startDate.getDate()} – ${fmtFull.format(endDate)}`;
  }
  const fmtShort = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  });
  return `${fmtShort.format(startDate)} → ${fmtFull.format(endDate)}`;
}

export default function TournamentCard({
  tournament,
}: TournamentCardProps): JSX.Element {
  const isRunning = tournament.status === 'running';
  const range = formatRange(tournament.startDate, tournament.endDate);
  const slotsLeft =
    tournament.maxTeams != null
      ? Math.max(0, tournament.maxTeams - tournament.teamCount)
      : null;
  const detailHref = tournament.slug
    ? `/tournament/${tournament.slug}`
    : `/tournament/${tournament.id}`;

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 p-6 md:p-8 backdrop-blur-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-blue-200/80">
            <span className="inline-flex items-center rounded-full border border-blue-300/40 bg-blue-500/15 px-2.5 py-1 text-blue-50 text-[10px] font-semibold">
              Tournoi
            </span>
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-rose-100 text-[10px] font-semibold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                </span>
                En direct
              </span>
            )}
            {tournament.format && <span>{tournament.format}</span>}
            {range && <span>{range}</span>}
          </div>
          <h3 className="mt-2 text-2xl md:text-3xl font-bold text-white leading-tight">
            {tournament.name}
          </h3>
          <Paragraph
            className="mt-2 text-sm md:text-base"
            textColor="text-gray-300"
          >
            {tournament.maxTeams != null ? (
              <>
                <span className="font-semibold text-white">
                  {tournament.teamCount}
                </span>
                {' / '}
                <span>{tournament.maxTeams}</span> équipes inscrites
                {slotsLeft != null && slotsLeft > 0 && !isRunning && (
                  <span className="ml-2 inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100">
                    {slotsLeft} place{slotsLeft > 1 ? 's' : ''} restante
                    {slotsLeft > 1 ? 's' : ''}
                  </span>
                )}
              </>
            ) : (
              <>{tournament.teamCount} équipes inscrites</>
            )}
          </Paragraph>
        </div>
        <div className="flex flex-col items-stretch gap-2 shrink-0 md:items-end">
          <div className="flex flex-row items-center gap-3">
            <Link
              href={detailHref}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Voir les matchs
            </Link>
            {!isRunning && (
              <Link
                href="/team/create"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow hover:-translate-y-0.5 hover:shadow-lg transition"
              >
                S&apos;inscrire
              </Link>
            )}
          </div>
          {!isRunning && (
            <Link
              href="/guide/gerer-mon-equipe"
              className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-white transition-colors"
            >
              Première inscription ? Voir le guide capitaine
              <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
