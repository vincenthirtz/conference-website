// pages/tournament/[id]/matches.tsx

import { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import type { MatchStatus as BaseMatchStatus } from '@/types/admin';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatDateRange } from '@/utils/tournamentDates';

import { logger } from '../../../utils/logger';
type MatchStatus = BaseMatchStatus | 'completed';
type MatchesDict = ReturnType<typeof useT<'tournamentMatches'>>;

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
};

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
  const t = useT('tournamentMatches');
  const locale = useLocale();
  const { lang } = useLang();
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
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

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (statusFilter === 'pending' && m.status !== 'pending') return false;
      if (statusFilter === 'ongoing' && m.status !== 'ongoing') return false;
      if (statusFilter === 'finished' && m.status !== 'finished') return false;
      if (stageFilter !== 'all' && m.stage?.id !== stageFilter) return false;
      return true;
    });
  }, [matches, statusFilter, stageFilter]);

  const grouped = groupMatchesByDay(filteredMatches, t.dateTbd, locale);

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
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{format(t.headTitle, { name: tournament.name })}</title>
      </Head>

      <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
        {/* Header */}
        <section className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 mb-3 text-[10px] uppercase tracking-wide">
                <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-pink-500/80 to-orange-400/80 text-black font-semibold">
                  OW Women&apos;s Cup
                </span>
                <span className="text-gray-200">
                  {tournament.game || 'Overwatch'}
                </span>
                <span className="w-[1px] h-3 bg-white/20" />
                <span className={statusColor}>{statusLabel}</span>
              </div>

              <Heading typeStyle="heading-md" className="text-gradient mb-1">
                {format(t.heading, { name: tournament.name })}
              </Heading>
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
                className="max-w-xl"
              >
                {t.description}
              </Paragraph>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Link href={tournamentPath}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-blue-400"
                >
                  {t.backToTournament}
                </Button>
              </Link>
              <Link href={`${tournamentPath}/bracket`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-purple-400"
                >
                  {t.viewBracket}
                </Button>
              </Link>
              <Link href={`${tournamentPath}/maps`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-emerald-400"
                >
                  {t.topMaps}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="mb-4">
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

              {hasFilters && (
                <div className="flex flex-wrap gap-2 justify-end">
                  <Link href={`${tournamentPath}/matches`} shallow>
                    <Button
                      type="button"
                      className="text-xs px-3 py-1.5 bg-transparent border border-white/25 hover:border-red-400 rounded-full"
                    >
                      {t.resetFilters}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Matches list */}
        <section>
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {filteredMatches.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                {t.noMatchesFilter}
              </Paragraph>
            )}

            {filteredMatches.length > 0 && (
              <div className="space-y-4">
                {grouped.map((day) => (
                  <div key={day.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold text-gray-100">
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
                        <MatchRow key={m.id} match={m} />
                      ))}
                    </div>
                  </div>
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

function MatchRow({ match }: { match: SimpleMatch }) {
  const t = useT('tournamentMatches');
  const locale = useLocale();
  const t1 = match.team1?.short_name || match.team1?.name || t.teamPlaceholder1;
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? t.byeLabel : t.teamPlaceholder2);

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
      <div className="group grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,0.7fr)] gap-2 items-center px-2 py-1.5 rounded-xl bg-white/3 border border-white/10 hover:border-emerald-400/70 hover:bg-emerald-500/5 cursor-pointer transition-colors text-[11px]">
        {/* Teams */}
        <div className="flex flex-col">
          <p className="text-gray-100 truncate">
            {t1}{' '}
            {!match.is_bye && (
              <>
                <span className="text-gray-500">{t.vsLabel}</span> {t2}
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

        {/* Time */}
        <div className="flex flex-col items-start">
          <span className="text-[10px] text-gray-300">
            {dateLabel || t.timeTbd}
          </span>
        </div>

        {/* Status / score */}
        <div className="flex flex-col items-end justify-center gap-[2px]">
          <span className={statusColor}>{statusLabel}</span>
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
    const d = m.scheduled_at ? new Date(m.scheduled_at) : null;
    const key = d ? d.toISOString().slice(0, 10) : 'unscheduled';
    const label = d
      ? d.toLocaleDateString(locale, {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
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
