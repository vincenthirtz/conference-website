/* eslint-disable @next/next/no-img-element */
// components/tournament/landing/TournamentHero.tsx
//
// Hero premium plein écran : artwork (banner_url) + overlay + mesh animé +
// grain, badge OW / jeu / statut (+ LIVE), titre, sous-titre, méta, rareté
// (places restantes), compte à rebours géant et double CTA.

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatDateRange } from '@/utils/tournamentDates';
import TournamentCountdown from './TournamentCountdown';
import { Spotlight } from './primitives';
import type {
  LandingTournament,
  LandingLeague,
  TournamentPhase,
} from './types';

export default function TournamentHero({
  tournament,
  phase,
  tournamentPath,
  totalTeams,
  placesRemaining,
  leagues,
  registrationOpen,
}: {
  tournament: LandingTournament;
  phase: TournamentPhase;
  tournamentPath: string;
  totalTeams: number;
  placesRemaining: number | null;
  leagues: LandingLeague[];
  registrationOpen: boolean;
}) {
  const t = useT('tournamentLanding');
  const { lang } = useLang();

  const dateRangeLabel = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    lang
  );
  const registerHref = `/team/create?tournament=${tournament.id}`;
  const teamsHref = `${tournamentPath}/teams`;

  const placesLabel =
    placesRemaining === null
      ? null
      : placesRemaining <= 0
        ? t.placesFull
        : (placesRemaining > 1 ? t.placesRemaining_other : t.placesRemaining_one).replace(
            '{count}',
            String(placesRemaining)
          );

  return (
    <header className="relative overflow-hidden">
      {/* Artwork / fond */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {tournament.banner_url ? (
          <img
            src={tournament.banner_url}
            alt=""
            className="h-full w-full object-cover object-center opacity-40"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <div className="tl-mesh absolute inset-0" />
        )}
        {/* Overlays de lisibilité */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a1a]/70 via-[#0a0a1a]/85 to-[#0a0a1a]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,transparent,rgba(10,10,26,0.6))]" />
        <div className="tl-grain absolute inset-0" />
        <Spotlight
          color="violet"
          className="left-[-10%] top-[-15%] h-[520px] w-[520px]"
        />
        <Spotlight
          color="green"
          className="right-[-8%] top-[10%] h-[420px] w-[420px]"
        />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32 md:pb-24 md:pt-40">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* Colonne gauche : identité + CTA */}
          <div>
            {/* Badges */}
            <div className="mb-6 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                {t.eyebrowOfficial}
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-gray-200 backdrop-blur-sm">
                {tournament.game || 'Overwatch'}
              </span>
              {phase === 'live' && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-red-300">
                  <span className="tl-live-dot h-1.5 w-1.5 rounded-full bg-red-400" />
                  {t.liveNow}
                </span>
              )}
            </div>

            <h1 className="text-4xl font-black leading-[0.98] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              <span className="text-brand-gradient">{tournament.name}</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-300 sm:text-lg">
              {t.heroSubtitle}
            </p>

            {/* Méta : date · format · rareté */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {dateRangeLabel && (
                <span className="inline-flex items-center gap-2 text-gray-200">
                  <CalendarGlyph />
                  {dateRangeLabel}
                </span>
              )}
              {tournament.format && (
                <span className="inline-flex items-center gap-2 text-gray-200">
                  <span className="text-gray-600">·</span>
                  <span className="font-medium">{tournament.format}</span>
                </span>
              )}
              {registrationOpen && placesLabel && (
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 px-3 py-1 text-[12px] font-semibold text-[var(--color-green-light)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)]" />
                  {placesLabel}
                </span>
              )}
            </div>

            {/* Ligues parentes */}
            {leagues.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-widest text-gray-500">
                  {t.seasonLabel}
                </span>
                {leagues.map((league) => (
                  <Link key={league.slug} href={`/leagues/${league.slug}`}>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-gray-200 transition-colors hover:border-[var(--color-violet)]/50 hover:text-[var(--color-violet-light)]">
                      {league.name}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {/* CTA */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {registrationOpen ? (
                <Link href={registerHref}>
                  <span className="tl-cta-glow inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-green)] to-[var(--color-yellow)] px-7 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-light)]">
                    {t.ctaRegister}
                    <ArrowGlyph />
                  </span>
                </Link>
              ) : (
                <Link href={`${tournamentPath}/bracket`}>
                  <span className="tl-cta-glow inline-flex items-center gap-2 rounded-full bg-[var(--color-violet)] px-7 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]">
                    {t.ctaViewBracket}
                    <ArrowGlyph />
                  </span>
                </Link>
              )}

              <Link href={teamsHref}>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/10">
                  {t.ctaViewTeams}
                </span>
              </Link>
            </div>

            {tournament.rules_url && (
              <a
                href={tournament.rules_url}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-[12px] text-gray-400 transition-colors hover:text-[var(--color-violet-light)]"
              >
                <RulesGlyph />
                {t.rulesLink}
              </a>
            )}
          </div>

          {/* Colonne droite : compte à rebours géant */}
          <div className="lg:justify-self-end">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md sm:p-8">
              <TournamentCountdown
                targetDate={tournament.start_date}
                phase={phase}
                size="giant"
              />
              {phase !== 'live' && phase !== 'finished' && (
                <p className="mt-6 flex items-center gap-2 text-xs text-gray-400">
                  <span className="h-1 w-1 rounded-full bg-[var(--color-green)]" />
                  {totalTeams > 0
                    ? (t.teamsMore.replace('{count}', String(totalTeams)))
                    : t.scrollHint}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── petits glyphes locaux (inline, pas de dépendance) ── */
function CalendarGlyph() {
  return (
    <svg
      className="h-4 w-4 text-[var(--color-violet-light)]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
function ArrowGlyph() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M13 7l5 5m0 0l-5 5m5-5H6"
      />
    </svg>
  );
}
function RulesGlyph() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
