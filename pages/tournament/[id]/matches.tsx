// pages/tournament/[id]/matches.tsx

import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import type { MatchStatus as BaseMatchStatus } from '@/types/admin';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatDateRange } from '@/utils/tournamentDates';
import TournamentTabs from '@/components/tournament/TournamentTabs';
import {
  mondayOf,
  addDaysYmd,
  dateAndMinuteInTz,
  todayYmdInTz,
} from '@/utils/teams/scrimCalendar';

import { logger } from '../../../utils/logger';
import PrintExportButton from '@/components/PrintExportButton';
import TeamAvatar from '@/components/Team/TeamAvatar';
import nsTournamentMatches from '@/lib/i18n/locales/fr/tournamentMatches';

// Fuseau de référence pour placer les matchs dans la grille mensuelle.
const MATCHES_TZ = 'Europe/Paris';

type ViewMode = 'list' | 'agenda' | 'month';
type MatchStatus = BaseMatchStatus | 'completed';
type MatchesDict = typeof nsTournamentMatches.fr;

type Tournament = {
  id: string;
  slug?: string | null;
  name: string;
  short_name?: string | null;
  game?: string | null;
  status: string;
  format?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  visibility?: string | null;
};

type Stage = {
  id: string;
  tournament_id: string;
  name: string;
  stage_type: string;
};

type SimpleTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

type SimpleMatch = {
  id: string;
  scheduled_at: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  round_name: string | null;
  round_number: number | null;
  match_format: string | null;
  team1_score: number | null;
  team2_score: number | null;
  team1: SimpleTeam | null;
  team2: SimpleTeam | null;
  stage: {
    id: string;
    name: string;
    stage_type: string;
  } | null;
};

type Props = {
  tournament: Tournament;
  stages: Stage[];
  matches: SimpleMatch[];
  seo: SeoProps;
};

// SEO par-entité : titre + description bilingues dédiés au calendrier/résultats
// du tournoi. Retourné via `props.seo` (privilégié par `_app.tsx` sur la
// propriété statique `Component.seo`).
function buildMatchesSeo(tournament: Tournament): SeoProps {
  const name = tournament.name;
  return {
    title: { fr: `Matchs – ${name}`, en: `Matches – ${name}` },
    description: {
      fr: `Calendrier et résultats des matchs du tournoi ${name} — OW Women's Cup : horaires, scores en direct, agenda et vue mensuelle.`,
      en: `Match schedule and results for the ${name} tournament — OW Women's Cup: kickoff times, live scores, agenda and month view.`,
    },
    type: 'website',
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) {
    return { notFound: true, revalidate: 60 };
  }

  // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
  const tenantId = DEFAULT_TENANT_ID;

  // 1) Tournoi (UUID ou slug)
  const tournament = await findTournamentByIdOrSlug<Tournament>(
    id,
    '*',
    tenantId
  );
  if (!tournament) {
    return { notFound: true, revalidate: 60 };
  }
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }
  const tournamentId = tournament.id;

  // 2) Stages
  const { data: stages, error: sErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });

  if (sErr) {
    logger.error('matches page stages error:', sErr);
  }

  // 3) Tous les matchs non annulés (filtrage côté client)
  const { data: matchesData, error: mErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      scheduled_at,
      status,
      is_bye,
      round_name,
      round_number,
      match_format,
      team1_score,
      team2_score,
      team1:team1_id ( id, name, short_name, logo_url ),
      team2:team2_id ( id, name, short_name, logo_url ),
      stage:tournament_stages ( id, name, stage_type )
    `
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true })
    .order('created_at', { ascending: true });

  if (mErr) {
    logger.error('matches page matches error:', mErr);
  }

  const matches = (matchesData || []) as any as SimpleMatch[];

  return {
    props: {
      tournament: tournament as Tournament,
      stages: (stages || []) as Stage[],
      matches,
      seo: buildMatchesSeo(tournament as Tournament),
    },
    revalidate: 60,
  };
};

export default function TournamentMatchesPage({
  tournament,
  stages,
  matches,
}: Props) {
  const router = useRouter();
  const t = useT(nsTournamentMatches);
  const locale = useLocale();
  const { lang } = useLang();
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  // Flux iCalendar de l'agenda (tout le tournoi, indépendant des filtres).
  const hasScheduled = matches.some((m) => m.scheduled_at);
  const icsHref = `/api/tournament/${tournament.slug || tournament.id}/calendar.ics`;
  const webcalHref = `webcal://${(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://owwomenscup.fr'
  )
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')}${icsHref}`;
  const statusFilter =
    typeof router.query.status === 'string' ? router.query.status : 'all';
  const stageFilter =
    typeof router.query.stageId === 'string' ? router.query.stageId : 'all';

  const dateRangeLabel = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    lang
  );
  const statusLabel = getStatusLabel(tournament.status, t);
  const statusColor = getStatusChipColor(tournament.status);
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';
  const hasFfaStage = stages.some((s) => s.stage_type === 'ffa');

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (statusFilter === 'pending' && m.status !== 'pending') return false;
      if (statusFilter === 'ongoing' && m.status !== 'ongoing') return false;
      if (statusFilter === 'finished' && m.status !== 'finished') return false;
      if (stageFilter !== 'all' && m.stage?.id !== stageFilter) return false;
      return true;
    });
  }, [matches, statusFilter, stageFilter]);

  const grouped = useMemo(
    () => groupMatchesByDay(filteredMatches, t.dateTbd, locale),
    [filteredMatches, t.dateTbd, locale]
  );

  // Flat chronological order for list mode (unscheduled last).
  const sortedMatches = useMemo(() => {
    return [...filteredMatches].sort((a, b) => {
      if (!a.scheduled_at && !b.scheduled_at) return 0;
      if (!a.scheduled_at) return 1;
      if (!b.scheduled_at) return -1;
      return a.scheduled_at.localeCompare(b.scheduled_at);
    });
  }, [filteredMatches]);

  const [viewMode, setViewMode] = useState<ViewMode>('agenda');

  // Restore persisted preference (SSR-safe: read after mount only).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('tournamentMatchesView');
      if (saved === 'list' || saved === 'agenda' || saved === 'month')
        setViewMode(saved);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);

  // Month shown by default in month view: the month of the first scheduled
  // match, else the tournament start date, else the current month. Deterministic
  // from props so it stays stable across renders.
  const monthInitialAnchor = useMemo(() => {
    const seed =
      matches.find((m) => m.scheduled_at)?.scheduled_at ||
      tournament.start_date ||
      null;
    if (seed) {
      const pos = dateAndMinuteInTz(seed, MATCHES_TZ);
      if (pos) return `${pos.ymd.slice(0, 7)}-01`;
    }
    return `${todayYmdInTz(MATCHES_TZ).slice(0, 7)}-01`;
  }, [matches, tournament.start_date]);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem('tournamentMatchesView', mode);
    } catch {
      /* ignore persistence failure */
    }
  };

  const hasFilters = statusFilter !== 'all' || stageFilter !== 'all';

  const updateFilter = (key: 'status' | 'stageId', value: string) => {
    const next: Record<string, string> = {
      ...(router.query as Record<string, string>),
    };
    if (value === 'all') delete next[key];
    else next[key] = value;
    router.replace(
      {
        pathname: router.pathname,
        query: { ...next, id: tournament.slug || tournament.id },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  return (
    <div className="print-document min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
        {/* Header */}
        <section className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 mb-3 text-[10px] uppercase tracking-wide">
                <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] text-black font-semibold">
                  OW Women&apos;s Cup
                </span>
                <span className="text-gray-200">
                  {tournament.game || 'Overwatch'}
                </span>
                {/* Le statut du tournoi est une métadonnée d'écran : sur une
                    feuille, « PUBLISHED » n'apprend rien à personne. */}
                <span className="w-[1px] h-3 bg-white/20 print:hidden" />
                <span className={`${statusColor} print:hidden`}>
                  {statusLabel}
                </span>
              </div>

              <Heading
                typeStyle="heading-md"
                className="text-brand-gradient mb-1"
              >
                {format(t.heading, { name: tournament.name })}
              </Heading>
              <span className="brand-rule mb-2" aria-hidden />
              {dateRangeLabel && (
                <p className="text-sm text-gray-300 mb-1">
                  {dateRangeLabel}
                  {tournament.format && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-gray-100">{tournament.format}</span>
                    </>
                  )}
                </p>
              )}
              <Paragraph
                typeStyle="body-sm"
                textColor="text-gray-200"
                className="max-w-xl print:hidden"
              >
                {t.description}
              </Paragraph>
              {/* À l'impression, la phrase d'écran renvoie à des filtres qui
                  n'existent plus. Celle-ci dit ce que le lecteur a en main —
                  et surtout que le document peut être un extrait filtré. */}
              <p className="hidden max-w-xl text-sm print:block">
                {t.printIntro}
              </p>
            </div>

            <PrintExportButton className="shrink-0 self-start" />
          </div>
        </section>

        {/* Onglets : de la navigation, donc rien à faire sur une feuille. */}
        <div className="print:hidden">
          <TournamentTabs
            tournamentPath={tournamentPath}
            active="matches"
            showPodium={isCompleted}
            showFfa={hasFfaStage}
          />
        </div>

        {/* Filters — commandes d'écran. Le PDF garde la liste TELLE QU'ELLE est
            filtrée à l'écran (c'est le but : imprimer ce qu'on regarde), mais
            les boutons de filtre eux-mêmes n'ont rien à y faire. */}
        <section className="mb-4 print:hidden">
          <div className="bg-black/60 border border-white/5 rounded-2xl p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px]">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-gray-400 uppercase tracking-wide">
                  {t.filtersLabel}
                </span>

                {/* Status filter */}
                <label className="flex items-center gap-1">
                  <span className="text-gray-400">{t.statusFilterLabel}</span>
                  <select
                    name="status"
                    value={statusFilter}
                    onChange={(e) => updateFilter('status', e.target.value)}
                    className="bg-black border border-white/15 rounded-lg px-2 py-1 text-[11px] text-gray-100"
                  >
                    <option value="all">{t.filterAll}</option>
                    <option value="pending">{t.filterUpcoming}</option>
                    <option value="ongoing">{t.filterOngoing}</option>
                    <option value="finished">{t.filterFinished}</option>
                  </select>
                </label>

                {/* Stage filter */}
                <label className="flex items-center gap-1">
                  <span className="text-gray-400">{t.stageFilterLabel}</span>
                  <select
                    name="stageId"
                    value={stageFilter}
                    onChange={(e) => updateFilter('stageId', e.target.value)}
                    className="bg-black border border-white/15 rounded-lg px-2 py-1 text-[11px] text-gray-100 max-w-[180px]"
                  >
                    <option value="all">{t.filterAllStages}</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-2 items-center justify-end">
                {hasFilters && (
                  <Button
                    as="link"
                    href={`${tournamentPath}/matches`}
                    className="text-xs px-3 py-1.5 bg-transparent border border-white/25 hover:border-red-400 rounded-full"
                  >
                    {t.resetFilters}
                  </Button>
                )}

                {/* View mode toggle */}
                <div
                  role="group"
                  aria-label={t.viewToggleLabel}
                  className="inline-flex rounded-full overflow-hidden border border-white/15"
                >
                  <button
                    type="button"
                    aria-pressed={viewMode === 'agenda'}
                    onClick={() => changeViewMode('agenda')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] transition-colors ${
                      viewMode === 'agenda'
                        ? 'bg-[var(--color-violet)] text-black font-semibold'
                        : 'bg-transparent text-gray-300 hover:text-white'
                    }`}
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                    {t.viewAgenda}
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewMode === 'month'}
                    onClick={() => changeViewMode('month')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] transition-colors border-l border-white/15 ${
                      viewMode === 'month'
                        ? 'bg-[var(--color-violet)] text-black font-semibold'
                        : 'bg-transparent text-gray-300 hover:text-white'
                    }`}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 5h16v16H4V5zm0 4h16M9 3v4m6-4v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"
                      />
                    </svg>
                    {t.viewMonth}
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewMode === 'list'}
                    onClick={() => changeViewMode('list')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] transition-colors ${
                      viewMode === 'list'
                        ? 'bg-[var(--color-violet)] text-black font-semibold'
                        : 'bg-transparent text-gray-300 hover:text-white'
                    }`}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 10h16M4 14h16M4 18h16"
                      />
                    </svg>
                    {t.viewList}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Matches list */}
        <section>
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {filteredMatches.length > 0 && (
              <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="flex items-center gap-1 text-[10px] text-gray-500">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {t.timezoneNote}
                </p>

                {hasScheduled && (
                  <div
                    className="flex items-center gap-1.5 print:hidden"
                    aria-label={t.calendarLabel}
                  >
                    <a
                      href={icsHref}
                      download
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-gray-200 hover:border-[var(--color-violet)] hover:text-white transition"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
                        />
                      </svg>
                      {t.calendarDownload}
                    </a>
                    <a
                      href={webcalHref}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-gray-200 hover:border-[var(--color-green)] hover:text-white transition"
                    >
                      <svg
                        className="w-3 h-3"
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
                      {t.calendarSubscribe}
                    </a>
                  </div>
                )}
              </div>
            )}

            {filteredMatches.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                {t.noMatchesFilter}
              </Paragraph>
            )}

            {filteredMatches.length > 0 && viewMode === 'agenda' && (
              <div className="space-y-3">
                {grouped.map((day) => (
                  <div
                    key={day.key}
                    className="print-day-group rounded-2xl bg-white/3 border border-white/10 p-3"
                  >
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
                      <p className="text-[11px] font-semibold text-gray-100 uppercase tracking-wide">
                        {day.label}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {format(
                          day.matches.length > 1
                            ? t.matchesCount_other
                            : t.matchesCount_one,
                          { count: day.matches.length }
                        )}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {day.matches.map((m) => (
                        <div key={m.id} className="flex items-stretch gap-2">
                          <div className="flex-shrink-0 w-12 flex items-center justify-center rounded-xl bg-black/40 border border-white/10 text-[11px] font-semibold text-gray-200 tabular-nums">
                            {formatMatchTime(m.scheduled_at, locale) || '—'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <MatchRow match={m} showDate={false} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredMatches.length > 0 && viewMode === 'month' && (
              <MatchMonthCalendar
                matches={filteredMatches}
                initialAnchor={monthInitialAnchor}
                locale={locale}
                t={t}
              />
            )}

            {filteredMatches.length > 0 && viewMode === 'list' && (
              <div className="space-y-1.5">
                {sortedMatches.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Components & utils
 * ────────────────────────────────────────────*/

function MatchRow({
  match,
  showDate = true,
}: {
  match: SimpleMatch;
  showDate?: boolean;
}) {
  const t = useT(nsTournamentMatches);
  const locale = useLocale();
  const t1 = match.team1?.short_name || match.team1?.name || t.teamPlaceholder1;
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? t.byeLabel : t.teamPlaceholder2);

  // À l'écran, le nom court tient dans la colonne. Sur une feuille, il fait
  // deviner : le PDF mélangeait « ASH », « HND SPRKL » et « Team Positivité »
  // — cette dernière n'ayant pas de nom court. Le papier a la place, il prend
  // le nom complet, et la liste redevient homogène.
  const t1Print = match.team1?.name || t.teamPlaceholder1;
  const t2Print =
    match.team2?.name || (match.is_bye ? t.byeLabel : t.teamPlaceholder2);

  // Tant que le classement n'est pas joué, une finale n'a aucune des deux
  // équipes. « Équipe 1 vs Équipe 2 » se lit alors comme un gabarit oublié —
  // surtout imprimé, où rien n'indique que la page est simplement en avance
  // sur la compétition.
  const pairingUnknown = !match.team1 && !match.team2 && !match.is_bye;

  const dateLabel = formatMatchDate(match.scheduled_at, locale);
  const statusLabel = getMatchStatusShort(match.status, t);
  const statusColor = getMatchStatusColor(match.status);

  const isFinished = match.status === 'finished';
  const hasScores =
    match.team1_score !== null &&
    match.team1_score !== undefined &&
    match.team2_score !== null &&
    match.team2_score !== undefined;

  const scoreLabel =
    isFinished || hasScores
      ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
      : '';

  return (
    <Link href={`/match/${match.id}`}>
      <div
        className={`match-row group grid gap-2 items-center px-2 py-1.5 rounded-xl bg-white/3 border border-white/10 hover:border-emerald-400/70 hover:bg-emerald-500/5 cursor-pointer transition-colors text-[11px] ${
          showDate
            ? 'grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,0.7fr)]'
            : 'grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]'
        }`}
      >
        {/* Teams */}
        <div className="flex flex-col">
          <p className="flex items-center gap-1.5 text-gray-100 truncate">
            {/* Les pastilles rendent la ligne repérable d'un coup d'œil : sur
                sept journées, on cherche SON équipe, pas une chaîne de
                caractères. Une équipe sans logo reçoit son monogramme, jamais
                un trou. */}
            {pairingUnknown && (
              <span className="italic text-gray-400">{t.pairingTbd}</span>
            )}
            {!pairingUnknown && match.team1 && (
              <TeamAvatar
                name={match.team1.name}
                shortName={match.team1.short_name}
                logoUrl={match.team1.logo_url}
                size="xs"
                className="print:hidden"
              />
            )}
            {!pairingUnknown && (
              <>
                <span className="truncate print:hidden">{t1}</span>
                <span className="hidden print:inline">{t1Print}</span>
              </>
            )}
            {!pairingUnknown && !match.is_bye && (
              <>
                <span className="text-gray-500">{t.vsLabel}</span>
                {match.team2 && (
                  <TeamAvatar
                    name={match.team2.name}
                    shortName={match.team2.short_name}
                    logoUrl={match.team2.logo_url}
                    size="xs"
                    className="print:hidden"
                  />
                )}
                <span className="truncate print:hidden">{t2}</span>
                <span className="hidden print:inline">{t2Print}</span>
              </>
            )}
            {match.is_bye && (
              <span className="text-gray-500"> {t.byeLabel}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2 text-[10px] text-gray-400">
            {match.stage && <span>{match.stage.name}</span>}
            {match.round_name && (
              <>
                <span className="text-gray-600">·</span>
                <span>{match.round_name}</span>
              </>
            )}
            {match.match_format && (
              <>
                <span className="text-gray-600">·</span>
                <span>{match.match_format.toUpperCase()}</span>
              </>
            )}
          </div>
        </div>

        {/* Time (list mode only — agenda has a dedicated left time column) */}
        {showDate && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-gray-300">
              {dateLabel || t.timeTbd}
            </span>
          </div>
        )}

        {/* Status / score */}
        <div className="flex flex-col items-end justify-center gap-[2px]">
          <span
            className={`${statusColor}${
              match.status === 'pending' ? ' print:hidden' : ''
            }`}
          >
            {statusLabel}
          </span>
          {scoreLabel && (
            <span className="text-[11px] font-semibold text-emerald-300">
              {scoreLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────
 * Month view (grille 6×7, lundi en tête)
 * ────────────────────────────────────────────*/

const MONTH_MAX_CHIPS = 3;
const pad2 = (n: number) => String(n).padStart(2, '0');

const MONTH_CHIP: Record<string, string> = {
  pending: 'bg-yellow-500/25 text-yellow-100 hover:bg-yellow-500/35',
  ongoing: 'bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/40',
  finished: 'bg-gray-500/25 text-gray-200 hover:bg-gray-500/35',
  completed: 'bg-gray-500/25 text-gray-200 hover:bg-gray-500/35',
  cancelled: 'bg-red-500/25 text-red-100 line-through hover:bg-red-500/35',
};

type MonthEvent = {
  id: string;
  minute: number;
  time: string;
  label: string;
  status: MatchStatus;
};

// En-têtes de jours localisés (2024-01-01 est un lundi).
function monthWeekdayHeads(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`2024-01-0${i + 1}T12:00:00Z`);
    return d.toLocaleDateString(locale, {
      weekday: 'short',
      timeZone: MATCHES_TZ,
    });
  });
}

// Décale un 'YYYY-MM-01' de n mois, renvoie le 1er du mois cible.
function shiftMonthAnchor(firstOfMonth: string, n: number): string {
  const [y, m] = firstOfMonth.split('-').map((v) => parseInt(v, 10));
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}-01`;
}

function MatchMonthCalendar({
  matches,
  initialAnchor,
  locale,
  t,
}: {
  matches: SimpleMatch[];
  initialAnchor: string;
  locale: string;
  t: MatchesDict;
}) {
  const [monthAnchor, setMonthAnchor] = useState(initialAnchor);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const anchorMonth = monthAnchor.slice(0, 7); // 'YYYY-MM'
  const todayYmd = useMemo(() => todayYmdInTz(MATCHES_TZ), []);
  const heads = useMemo(() => monthWeekdayHeads(locale), [locale]);

  const gridDays = useMemo(() => {
    const start = mondayOf(monthAnchor);
    return Array.from({ length: 42 }, (_, i) => addDaysYmd(start, i));
  }, [monthAnchor]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, MonthEvent[]> = {};
    for (const m of matches) {
      if (!m.scheduled_at) continue;
      const pos = dateAndMinuteInTz(m.scheduled_at, MATCHES_TZ);
      if (!pos) continue;
      const t1 = m.team1?.short_name || m.team1?.name || t.teamPlaceholder1;
      const t2 =
        m.team2?.short_name ||
        m.team2?.name ||
        (m.is_bye ? t.byeLabel : t.teamPlaceholder2);
      const label = m.is_bye
        ? `${t1} ${t.byeLabel}`
        : `${t1} ${t.vsLabel} ${t2}`;
      (map[pos.ymd] ??= []).push({
        id: m.id,
        minute: pos.minute,
        time: `${pad2(Math.floor(pos.minute / 60))}:${pad2(pos.minute % 60)}`,
        label,
        status: m.status,
      });
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.minute - b.minute);
    }
    return map;
  }, [matches, t]);

  const unscheduledCount = useMemo(
    () => matches.filter((m) => !m.scheduled_at).length,
    [matches]
  );

  const monthLabel = new Date(`${monthAnchor}T12:00:00Z`).toLocaleDateString(
    locale,
    { month: 'long', year: 'numeric', timeZone: MATCHES_TZ }
  );

  const goPrev = () => {
    setExpandedDay(null);
    setMonthAnchor((a) => shiftMonthAnchor(a, -1));
  };
  const goNext = () => {
    setExpandedDay(null);
    setMonthAnchor((a) => shiftMonthAnchor(a, 1));
  };
  const goToday = () => {
    setExpandedDay(null);
    setMonthAnchor(`${todayYmd.slice(0, 7)}-01`);
  };

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        <button
          type="button"
          aria-label={t.monthPrev}
          onClick={goPrev}
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-gray-200 hover:border-[var(--color-violet)] hover:text-white transition"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={t.monthNext}
          onClick={goNext}
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-gray-200 hover:border-[var(--color-violet)] hover:text-white transition"
        >
          ›
        </button>
        <span className="ml-1 text-gray-100 capitalize font-semibold">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={goToday}
          className="ml-auto rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-gray-200 hover:border-[var(--color-green)] hover:text-white transition"
        >
          {t.monthToday}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-2">
        <div className="min-w-[680px]">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 pb-1">
            {heads.map((h) => (
              <div
                key={h}
                className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500"
              >
                {h}
              </div>
            ))}
          </div>

          {/* 6×7 grid */}
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((day) => {
              const inMonth = day.slice(0, 7) === anchorMonth;
              const isToday = day === todayYmd;
              const events = eventsByDay[day] ?? [];
              const isExpanded = expandedDay === day;
              const shown = isExpanded
                ? events
                : events.slice(0, MONTH_MAX_CHIPS);
              const overflow = events.length - shown.length;
              const dayNum = parseInt(day.slice(8, 10), 10);
              return (
                <div
                  key={day}
                  className={`flex min-h-[92px] flex-col rounded-lg border p-1 ${
                    inMonth
                      ? 'border-white/10 bg-white/3'
                      : 'border-white/5 bg-white/[0.015] opacity-50'
                  }`}
                >
                  <span
                    className={`mb-1 text-[11px] font-semibold tabular-nums ${
                      isToday
                        ? 'inline-flex h-5 w-5 items-center justify-center self-start rounded-full bg-[var(--color-green)] text-black'
                        : inMonth
                          ? 'text-gray-300'
                          : 'text-gray-600'
                    }`}
                  >
                    {dayNum}
                  </span>

                  <span className="flex flex-col gap-0.5">
                    {shown.map((ev) => (
                      <Link
                        key={ev.id}
                        href={`/match/${ev.id}`}
                        title={`${ev.time} — ${ev.label}`}
                        className={`block cursor-pointer truncate rounded px-1 py-0.5 text-[9px] leading-tight transition ${
                          MONTH_CHIP[ev.status] ?? MONTH_CHIP.pending
                        }`}
                      >
                        <span className="tabular-nums">{ev.time}</span>{' '}
                        {ev.label}
                      </Link>
                    ))}
                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedDay(day)}
                        className="cursor-pointer rounded px-1 text-left text-[9px] text-gray-400 hover:text-gray-200"
                      >
                        {format(t.moreEvents, { count: overflow })}
                      </button>
                    )}
                    {isExpanded && events.length > MONTH_MAX_CHIPS && (
                      <button
                        type="button"
                        onClick={() => setExpandedDay(null)}
                        className="cursor-pointer rounded px-1 text-left text-[9px] text-gray-400 hover:text-gray-200"
                      >
                        {t.monthCollapse}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {unscheduledCount > 0 && (
        <p className="mt-2 text-[11px] text-gray-500">
          {format(
            unscheduledCount > 1
              ? t.monthUnscheduled_other
              : t.monthUnscheduled_one,
            { count: unscheduledCount }
          )}
        </p>
      )}
    </div>
  );
}

function groupMatchesByDay(
  matches: SimpleMatch[],
  dateTbdLabel: string,
  locale: string
): {
  key: string;
  label: string;
  matches: SimpleMatch[];
}[] {
  const groups = new Map<
    string,
    { key: string; label: string; matches: SimpleMatch[] }
  >();

  for (const m of matches) {
    // Group by the *Paris* calendar day so the day header matches the Paris
    // times shown on each row (and the month view).
    const pos = m.scheduled_at
      ? dateAndMinuteInTz(m.scheduled_at, MATCHES_TZ)
      : null;
    const key = pos ? pos.ymd : 'unscheduled';
    const label = pos
      ? new Date(`${pos.ymd}T12:00:00Z`).toLocaleDateString(locale, {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          timeZone: 'UTC',
        })
      : dateTbdLabel;

    if (!groups.has(key)) {
      groups.set(key, { key, label, matches: [] });
    }
    groups.get(key)!.matches.push(m);
  }

  const arr = Array.from(groups.values());
  arr.sort((a, b) => {
    if (a.key === 'unscheduled') return 1;
    if (b.key === 'unscheduled') return -1;
    return a.key.localeCompare(b.key);
  });

  return arr;
}

function formatMatchDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MATCHES_TZ,
  });
}

function formatMatchTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MATCHES_TZ,
  });
}

function getStatusLabel(status: string, t: MatchesDict): string {
  switch (status) {
    case 'upcoming':
      return t.statusUpcoming;
    case 'running':
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
    case 'completed':
      return t.statusFinished;
    default:
      return status;
  }
}

function getStatusChipColor(status: string): string {
  switch (status) {
    case 'upcoming':
      return 'px-1.5 py-[2px] rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/60';
    case 'running':
    case 'ongoing':
      return 'px-1.5 py-[2px] rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/60';
    case 'finished':
    case 'completed':
      return 'px-1.5 py-[2px] rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/60';
    default:
      return 'px-1.5 py-[2px] rounded-full bg-white/10 text-white border border-white/30';
  }
}

function getMatchStatusShort(status: MatchStatus, t: MatchesDict): string {
  switch (status) {
    case 'pending':
      return t.statusUpcoming;
    case 'ongoing':
      return t.statusOngoing;
    case 'completed':
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function getMatchStatusColor(status: MatchStatus): string {
  switch (status) {
    case 'pending':
      return 'px-1.5 py-[2px] rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/60';
    case 'ongoing':
      return 'px-1.5 py-[2px] rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/60';
    case 'completed':
    case 'finished':
      return 'px-1.5 py-[2px] rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/60';
    case 'cancelled':
      return 'px-1.5 py-[2px] rounded-full bg-red-500/20 text-red-200 border border-red-500/60';
    default:
      return 'px-1.5 py-[2px] rounded-full bg-white/10 text-white border border-white/30';
  }
}
