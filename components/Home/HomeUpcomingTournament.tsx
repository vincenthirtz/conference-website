import Link from 'next/link';
import type { JSX } from 'react';
import Paragraph from '@/components/Typography/paragraph';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  formatSiteDate,
  getWallClockParts,
  SITE_TIMEZONE,
} from '@/utils/timezone';
import nsHomeEvents from '@/lib/i18n/locales/fr/homeEvents';

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

/**
 * Période d'un tournoi : « 18 – 20 septembre 2026 » dans un même mois,
 * « 30 septembre → 4 octobre 2026 » sinon. Partagé avec HomeSpotlight.
 *
 * Tout se lit en heure de Paris, y compris le test « même mois » et le jour de
 * début : `getDate()` / `getMonth()` dépendaient du fuseau du serveur (UTC sur
 * Netlify) alors que la date de fin, elle, était formatée à Paris — un début
 * posé à minuit heure de Paris affichait la veille.
 */
export function formatTournamentRange(
  start: string | null,
  end: string | null,
  locale: string
): string | null {
  if (!start) return null;
  const startDate = new Date(start);
  if (isNaN(startDate.getTime())) return null;
  const endDate = end ? new Date(end) : null;
  const full: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };
  if (!endDate || isNaN(endDate.getTime())) {
    return formatSiteDate(startDate, locale, full);
  }
  const s = getWallClockParts(startDate, SITE_TIMEZONE).date; // YYYY-MM-DD
  const e = getWallClockParts(endDate, SITE_TIMEZONE).date;
  if (s === e) return formatSiteDate(startDate, locale, full);
  if (s.slice(0, 7) === e.slice(0, 7)) {
    return `${formatSiteDate(startDate, locale, { day: 'numeric' })} – ${formatSiteDate(endDate, locale, full)}`;
  }
  return `${formatSiteDate(startDate, locale, { day: 'numeric', month: 'long' })} → ${formatSiteDate(endDate, locale, full)}`;
}

export default function TournamentCard({
  tournament,
}: TournamentCardProps): JSX.Element {
  const t = useT(nsHomeEvents);
  const locale = useLocale();
  const isRunning = tournament.status === 'running';
  const range = formatTournamentRange(
    tournament.startDate,
    tournament.endDate,
    locale
  );
  const slotsLeft =
    tournament.maxTeams != null
      ? Math.max(0, tournament.maxTeams - tournament.teamCount)
      : null;
  const detailHref = tournament.slug
    ? `/tournament/${tournament.slug}`
    : `/tournament/${tournament.id}`;

  return (
    <div className="neon-card card-brand p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-blue-200/80">
            <span className="inline-flex items-center rounded-full border border-blue-300/40 bg-blue-500/15 px-2.5 py-1 text-blue-50 text-[10px] font-semibold">
              {t.badgeTournament}
            </span>
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-rose-100 text-[10px] font-semibold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                </span>
                {t.badgeLive}
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
                <span>{tournament.maxTeams}</span> {t.teamsRegisteredSuffix}
                {slotsLeft != null && slotsLeft > 0 && !isRunning && (
                  <span className="ml-2 inline-flex items-center rounded-full border border-[var(--color-green)]/45 bg-[var(--color-green)]/12 px-2 py-0.5 text-[11px] text-[var(--color-green-light)]">
                    {format(
                      slotsLeft > 1 ? t.slotsLeft_other : t.slotsLeft_one,
                      { count: slotsLeft }
                    )}
                  </span>
                )}
              </>
            ) : (
              <>
                {format(t.teamsRegisteredSimple, {
                  count: tournament.teamCount,
                })}
              </>
            )}
          </Paragraph>
        </div>
        <div className="flex flex-col items-stretch gap-2 shrink-0 md:items-end">
          <div className="flex flex-row items-center gap-3">
            <Link
              href={detailHref}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
            >
              {t.viewMatches}
            </Link>
            {!isRunning && (
              <Link
                href="/team/create"
                className="rounded-full bg-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:bg-[var(--color-violet-deep)] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
              >
                {t.register}
              </Link>
            )}
          </div>
          {!isRunning && (
            <Link
              href="/guide/gerer-mon-equipe"
              className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-white transition-colors"
            >
              {t.guideLink}
              <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
