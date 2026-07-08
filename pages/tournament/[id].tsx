// pages/tournament/[id].tsx

import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { useMemo } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import ShareEmbedPanel from '@/components/tournament/ShareEmbedPanel';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import type { MatchStatus } from '@/types/admin';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatDateRange } from '@/utils/tournamentDates';

import { logger } from '../../utils/logger';
type TournamentDetailDict = ReturnType<typeof useT<'tournamentDetail'>>;
type Tournament = {
  id: string;
  name: string;
  short_name?: string | null;
  slug?: string | null;
  game?: string | null;
  status: string;
  format?: string | null;
  max_teams?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  rules_url?: string | null;
  description_info?: string | null;
  schedule_details?: string | null;
  schedule_rules?: string | null;
  format_details?: string | null;
  visibility?: string | null;
  created_at: string;
  updated_at: string;
};

type Stage = {
  id: string;
  tournament_id: string;
  name: string;
  stage_type: string;
  default_match_format?: string | null;
  swiss_rounds?: number | null;
  bracket_format?: string | null;
  visible?: boolean | null;
};

type SimpleTeam = {
  id: string;
  slug?: string | null;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

type SimpleMatch = {
  id: string;
  scheduled_at: string | null;
  completed_at: string | null;
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

type LeagueRef = {
  slug: string;
  name: string;
};

type TournamentPageProps = {
  tournament: Tournament;
  stages: Stage[];
  teams: SimpleTeam[];
  matches: SimpleMatch[];
  leagues: LeagueRef[];
  seo: SeoProps;
};

function formatStageType(
  stageType: string | null | undefined,
  t: TournamentDetailDict
) {
  if (!stageType) return t.stageTypeOther;
  const map: Record<string, string> = {
    group: t.stageTypeGroup,
    bracket: t.stageTypeBracket,
    swiss: t.stageTypeSwiss,
    round_robin: t.stageTypeRoundRobin,
    showmatch: t.stageTypeShowmatch,
    other: t.stageTypeOther,
  };
  return map[stageType] || stageType;
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<TournamentPageProps> = async (
  ctx
) => {
  const rawId = ctx.params?.id;
  if (!rawId || Array.isArray(rawId)) {
    return { notFound: true, revalidate: 60 };
  }

  const asString = String(rawId);
  const isUuid =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      asString
    );

  // 1) Tournoi (accept both uuid id and slug)
  let tournament: Tournament | null = null;

  const tournamentColumns =
    'id, name, short_name, slug, game, status, format, max_teams, start_date, end_date, rules_url, description_info, schedule_details, schedule_rules, format_details, visibility, created_at, updated_at';

  // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
  const tenantId = DEFAULT_TENANT_ID;

  if (isUuid) {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select(tournamentColumns)
      .eq('tenant_id', tenantId)
      .eq('id', asString)
      .single();
    if (!error && data) {
      tournament = data as Tournament;
    }
  }

  if (!tournament) {
    const { data } = await supabaseAdmin
      .from('tournaments')
      .select(tournamentColumns)
      .eq('tenant_id', tenantId)
      .eq('slug', asString)
      .single();
    if (data) {
      tournament = data as Tournament;
    }
  }

  if (!tournament) {
    return { notFound: true, revalidate: 60 };
  }

  // Si visibilité non publique, tu peux choisir de renvoyer 404
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }

  const tournamentId = tournament.id;

  // Run all independent queries in parallel
  const [stagesResult, matchesResult, teamsResult, leaguesResult] =
    await Promise.all([
      // 2) Stages
      supabaseAdmin
        .from('tournament_stages')
        .select(
          'id, tournament_id, name, stage_type, default_match_format, swiss_rounds, bracket_format, visible'
        )
        .eq('tenant_id', tenantId)
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true }),

      // 3) Matches (limités)
      supabaseAdmin
        .from('matches')
        .select(
          `
        id,
        scheduled_at,
        completed_at,
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
        .order('scheduled_at', { ascending: true }),

      // 4) Teams (via tournament_teams — simpler join, no stage dependency)
      supabaseAdmin
        .from('tournament_teams')
        .select('team:teams ( id, slug, name, short_name, logo_url )')
        .eq('tenant_id', tenantId)
        .eq('tournament_id', tournamentId),

      // 5) Ligues auxquelles appartient ce tournoi (maillage interne).
      supabaseAdmin
        .from('league_tournaments')
        .select('league:leagues ( slug, name, is_public, status )')
        .eq('tenant_id', tenantId)
        .eq('tournament_id', tournamentId),
    ]);

  if (stagesResult.error)
    logger.error('tournament stages error:', stagesResult.error);
  if (matchesResult.error)
    logger.error('tournament matches error:', matchesResult.error);
  if (teamsResult.error)
    logger.error('tournament teams error:', teamsResult.error);
  if (leaguesResult.error)
    logger.error('tournament leagues error:', leaguesResult.error);

  const stages = (stagesResult.data || []) as any;
  const matches = (matchesResult.data || []) as any as SimpleMatch[];

  const teamMap = new Map<string, SimpleTeam>();
  (teamsResult.data || []).forEach((row: any) => {
    if (row.team) teamMap.set(row.team.id, row.team);
  });
  const teams = Array.from(teamMap.values());

  // Ne garder que les ligues publiques et non-draft, dédupliquées par slug.
  const leagueMap = new Map<string, LeagueRef>();
  (leaguesResult.data || []).forEach((row: any) => {
    const l = row.league;
    if (
      l &&
      l.slug &&
      l.is_public === true &&
      l.status !== 'draft' &&
      !leagueMap.has(l.slug)
    ) {
      leagueMap.set(l.slug, { slug: l.slug, name: l.name });
    }
  });
  const leagues = Array.from(leagueMap.values());

  return {
    props: {
      tournament,
      stages,
      teams,
      matches,
      leagues,
      seo: buildTournamentSeo(tournament),
    },
    revalidate: 60,
  };
};

export default function TournamentPage({
  tournament,
  stages,
  teams,
  matches,
  leagues,
}: Omit<TournamentPageProps, 'seo'>) {
  const t = useT('tournamentDetail');
  const { lang } = useLang();
  const totalTeams = teams.length;
  const now = useMemo(() => new Date(), []);
  const finishedMatches = matches.filter((m) => m.status === 'finished');
  const totalMatches = matches.length;
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;

  const upcomingMatches = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            (m.status === 'pending' || m.status === 'ongoing') &&
            m.scheduled_at &&
            new Date(m.scheduled_at) >= now
        )
        .slice(0, 6),
    [matches, now]
  );

  const recentMatches = useMemo(
    () =>
      finishedMatches
        .sort((a, b) => {
          const da = a.completed_at
            ? new Date(a.completed_at)
            : a.scheduled_at
              ? new Date(a.scheduled_at)
              : new Date(0);
          const db = b.completed_at
            ? new Date(b.completed_at)
            : b.scheduled_at
              ? new Date(b.scheduled_at)
              : new Date(0);
          return db.getTime() - da.getTime();
        })
        .slice(0, 6),
    [finishedMatches]
  );

  const mainStage = stages[0];

  const dateRangeLabel = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    lang
  );

  const statusLabel = getStatusLabelT(tournament.status, t);
  const statusColor = getStatusChipColor(tournament.status);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#0d0520] to-[#0a0a1a] text-white">
      {/* Decorative background blobs */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[var(--color-violet)]/10 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[500px] h-[500px] rounded-full bg-[var(--color-green)]/6 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-[var(--color-yellow)]/5 blur-3xl" />
      </div>

      <main className="relative container mx-auto px-4 pt-28 pb-20 max-w-6xl">
        {/* HERO */}
        <section className="mb-14">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] gap-8 items-start">
            {/* Left: title + description */}
            <div>
              <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-5 text-[10px] uppercase tracking-widest">
                <span className="px-2 py-[3px] rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] text-black font-bold text-[9px]">
                  OW Women&apos;s Cup
                </span>
                <span className="text-gray-300">
                  {tournament.game || 'Overwatch'}
                </span>
                <span className="w-[1px] h-3 bg-white/15" />
                <span className={statusColor}>{statusLabel}</span>
              </div>

              <Heading
                typeStyle="heading-lg"
                level="h1"
                className="text-brand-gradient mb-2"
              >
                {tournament.name}
              </Heading>
              <span className="brand-rule mb-3" aria-hidden />

              {dateRangeLabel && (
                <p className="text-sm text-gray-400 mb-3 flex items-center gap-2">
                  <svg
                    className="w-3.5 h-3.5 text-[var(--color-violet-light)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {dateRangeLabel}
                  {tournament.format && (
                    <>
                      {' · '}
                      <span className="text-gray-200 font-medium">
                        {tournament.format}
                      </span>
                    </>
                  )}
                </p>
              )}

              {/* Ligue(s) parente(s) — maillage interne vers /leagues/{slug} */}
              {leagues.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">
                    {t.seasonLabel}
                  </span>
                  {leagues.map((league) => (
                    <Link key={league.slug} href={`/leagues/${league.slug}`}>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-gray-200 hover:border-[var(--color-violet)]/50 hover:bg-[var(--color-violet)]/10 hover:text-[var(--color-violet-light)] transition-colors cursor-pointer">
                        <svg
                          className="w-3 h-3 text-[var(--color-violet-light)]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                        {league.name}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              <Paragraph
                typeStyle="body-lg"
                textColor="text-gray-300"
                className="max-w-xl leading-relaxed"
              >
                {t.heroDescription}
              </Paragraph>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`${tournamentPath}/bracket`}>
                  <Button
                    type="button"
                    className="px-6 py-2.5 text-xs font-bold rounded-full bg-[var(--color-violet)] text-white hover:bg-[var(--color-violet-deep)] shadow-lg shadow-[var(--color-violet-deep)]/30 transition-all hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
                  >
                    {t.ctaBracket}
                  </Button>
                </Link>

                <Link href={`${tournamentPath}/matches`}>
                  <Button
                    type="button"
                    className="px-6 py-2.5 text-xs font-semibold rounded-full bg-white/5 backdrop-blur-sm border border-white/20 hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 transition-all"
                  >
                    {t.ctaAllMatches}
                  </Button>
                </Link>

                <Link href={`${tournamentPath}/maps`}>
                  <Button
                    type="button"
                    className="px-6 py-2.5 text-xs font-semibold rounded-full bg-white/5 backdrop-blur-sm border border-white/20 hover:border-[var(--color-yellow)]/60 hover:bg-[var(--color-yellow)]/10 transition-all"
                  >
                    {t.ctaTopMaps}
                  </Button>
                </Link>

                {stages.some((s) => s.stage_type === 'ffa') && (
                  <Link href={`${tournamentPath}/ffa`}>
                    <Button
                      type="button"
                      className="px-6 py-2.5 text-xs font-semibold rounded-full bg-white/5 backdrop-blur-sm border border-white/20 hover:border-[var(--color-yellow)]/60 hover:bg-[var(--color-yellow)]/10 transition-all"
                    >
                      {t.ctaFfaStandings}
                    </Button>
                  </Link>
                )}

                {tournament.status === 'completed' && (
                  <Link href={`${tournamentPath}/podium`}>
                    <Button
                      type="button"
                      className="px-6 py-2.5 text-xs font-bold rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-black hover:from-amber-300 hover:to-yellow-400 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02]"
                    >
                      {t.ctaOfficialPodium}
                    </Button>
                  </Link>
                )}

                {tournament.status !== 'completed' &&
                  tournament.status !== 'finished' && (
                    <Link href={`/team/create?tournament=${tournament.id}`}>
                      <Button
                        type="button"
                        className="px-6 py-2.5 text-xs font-bold rounded-full bg-gradient-to-r from-[var(--color-green)] to-[var(--color-yellow)] text-black hover:from-[var(--color-green-light)] hover:to-[var(--color-yellow-light)] shadow-lg shadow-[var(--color-green-deep)]/20 transition-all hover:scale-[1.02]"
                      >
                        {t.ctaRegisterTeam}
                      </Button>
                    </Link>
                  )}

                <ShareEmbedPanel
                  slugOrId={tournament.slug || tournament.id}
                  name={tournament.name}
                  hasFfa={stages.some((s) => s.stage_type === 'ffa')}
                />
              </div>

              {tournament.rules_url && (
                <div className="mt-4">
                  <a
                    href={tournament.rules_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-[var(--color-violet-light)] transition-colors"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    {t.rulesLink}
                  </a>
                </div>
              )}
            </div>

            {/* Right: stats cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={t.statTeams}
                value={totalTeams || '—'}
                accent="purple"
                hint={
                  tournament.max_teams
                    ? format(t.hintRegistered, {
                        count: totalTeams,
                        max: tournament.max_teams,
                      })
                    : undefined
                }
              />
              <StatCard
                label={t.statMatches}
                value={totalMatches || '—'}
                accent="emerald"
                hint={
                  totalMatches > 0
                    ? format(t.hintFinished, { count: finishedMatches.length })
                    : undefined
                }
              />
              <StatCard
                label={t.statStages}
                value={stages.length || '—'}
                accent="blue"
                hint={mainStage ? mainStage.name : undefined}
              />
              <StatCard
                label={t.statFormat}
                value={tournament.format || '—'}
                accent="pink"
                hint={tournament.game || undefined}
              />
            </div>
          </div>
        </section>

        {/* INFOS TOURNOI */}
        {(tournament.description_info ||
          tournament.schedule_details ||
          tournament.schedule_rules ||
          tournament.format_details) && (
          <section className="mb-14 grid grid-cols-1 md:grid-cols-2 gap-6">
            {tournament.description_info && (
              <InfoCard
                title={t.infoTitle}
                content={tournament.description_info}
                accent="purple"
              />
            )}
            {tournament.schedule_details && (
              <InfoCard
                title={t.scheduleTitle}
                content={tournament.schedule_details}
                accent="blue"
              />
            )}
            {tournament.schedule_rules && (
              <InfoCard
                title={t.scheduleRulesTitle}
                content={tournament.schedule_rules}
                accent="emerald"
              />
            )}
            {tournament.format_details && (
              <InfoCard
                title={t.formatDetailsTitle}
                content={tournament.format_details}
                accent="pink"
              />
            )}
          </section>
        )}

        {/* STAGES + MATCHES */}
        <section className="mb-14 grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)] gap-6">
          {/* Stages overview */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">
                {t.stagesHeading}
              </p>
              {stages.length > 0 && (
                <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                  {format(
                    stages.length > 1 ? t.stagesCount_other : t.stagesCount_one,
                    { count: stages.length }
                  )}
                </span>
              )}
            </div>

            {stages.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-500">
                {t.stagesEmpty}
              </Paragraph>
            )}

            {stages.length > 0 && (
              <ul className="space-y-2.5">
                {stages.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-3 rounded-xl bg-gradient-to-r from-white/5 to-transparent border border-white/8 px-4 py-3 hover:border-[var(--color-violet)]/40 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {s.name}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {formatStageType(s.stage_type, t)}
                        {s.stage_type === 'swiss' && s.swiss_rounds
                          ? format(t.stageSwissRounds, {
                              count: s.swiss_rounds,
                            })
                          : ''}
                      </p>
                      {s.default_match_format && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {format(t.stageFormatLabel, {
                            format: s.default_match_format,
                          })}
                        </p>
                      )}
                    </div>
                    <Link href={`${tournamentPath}/bracket`}>
                      <span className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--color-violet)]/40 text-[var(--color-violet-light)] bg-[var(--color-violet-deep)]/25 hover:bg-[var(--color-violet-deep)]/45 cursor-pointer text-[10px] transition-colors">
                        <svg
                          className="w-2.5 h-2.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 7l5 5m0 0l-5 5m5-5H6"
                          />
                        </svg>
                        {t.bracketLabel}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Upcoming / recent matches */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">
                {t.keyMatchesHeading}
              </p>
              <Link href={`${tournamentPath}/matches`}>
                <span className="text-[11px] text-[var(--color-violet-light)] hover:text-white cursor-pointer transition-colors">
                  {t.viewAllMatches}
                </span>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Upcoming */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--color-green-light)]/80 mb-2 font-medium">
                  {t.upcomingHeading}
                </p>
                <div className="space-y-2">
                  {upcomingMatches.length === 0 && (
                    <p className="text-[11px] text-gray-500 italic">
                      {t.upcomingEmpty}
                    </p>
                  )}
                  {upcomingMatches.map((m) => (
                    <MatchLine key={m.id} match={m} compact />
                  ))}
                </div>
              </div>

              {/* Recent */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--color-yellow)]/80 mb-2 font-medium">
                  {t.recentHeading}
                </p>
                <div className="space-y-2">
                  {recentMatches.length === 0 && (
                    <p className="text-[11px] text-gray-500 italic">
                      {t.recentEmpty}
                    </p>
                  )}
                  {recentMatches.map((m) => (
                    <MatchLine key={m.id} match={m} compact showScore />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TEAMS + MAPS */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-6">
          {/* Teams */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">
                {t.teamsHeading}
              </p>
              {totalTeams > 0 && (
                <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                  {format(
                    totalTeams > 1 ? t.teamsCount_other : t.teamsCount_one,
                    { count: totalTeams }
                  )}
                </span>
              )}
            </div>

            {totalTeams === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-500">
                {t.teamsEmpty}
              </Paragraph>
            )}

            {totalTeams > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {teams.slice(0, 12).map((team) => (
                  <Link
                    key={team.id}
                    href={`/team/${encodeURIComponent(team.slug || team.id)}`}
                  >
                    <div className="group flex flex-col items-center gap-2.5 bg-gradient-to-b from-white/5 to-transparent border border-white/8 rounded-2xl px-3 py-4 cursor-pointer hover:border-[var(--color-green)]/50 hover:bg-[var(--color-green)]/5 transition-all hover:scale-[1.02]">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center overflow-hidden group-hover:border-[var(--color-green)]/30 transition-colors">
                        {team.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={team.logo_url}
                            alt={team.name}
                            width={56}
                            height={56}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-bold text-gray-400 group-hover:text-[var(--color-green-light)] transition-colors">
                            {initials(team.short_name || team.name)}
                          </span>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] font-semibold text-white truncate max-w-[100px]">
                          {team.short_name || team.name}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate max-w-[100px]">
                          {team.name}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}

                {totalTeams > 12 && (
                  <div className="flex items-center justify-center text-[11px] text-gray-400 bg-white/[0.02] rounded-2xl border border-dashed border-white/10">
                    {format(t.teamsMore, { count: totalTeams - 12 })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Maps highlight */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">
                {t.mapsHeading}
              </p>
              <Link href={`${tournamentPath}/maps`}>
                <span className="text-[11px] text-[var(--color-violet-light)] hover:text-white cursor-pointer transition-colors">
                  {t.viewAllMaps}
                </span>
              </Link>
            </div>

            <Paragraph
              typeStyle="body-sm"
              textColor="text-gray-400"
              className="mb-4 leading-relaxed"
            >
              {t.mapsDescription}
            </Paragraph>

            <div className="border border-white/8 rounded-xl px-4 py-3 bg-gradient-to-r from-[var(--color-yellow)]/8 to-transparent">
              <p className="text-[11px] text-gray-400">
                {t.mapsNoteBefore}
                <Link href={`${tournamentPath}/maps`}>
                  <span className="text-[var(--color-violet-light)] hover:text-white cursor-pointer transition-colors font-medium">
                    {t.mapsNoteLink}
                  </span>
                </Link>
                {t.mapsNoteAfter}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Components & utils locaux
 * ────────────────────────────────────────────*/

const ACCENT_STYLES: Record<string, { border: string; glow: string }> = {
  purple: {
    border: 'border-[var(--color-violet)]/25',
    glow: 'from-[var(--color-violet)]/10',
  },
  emerald: {
    border: 'border-[var(--color-green)]/25',
    glow: 'from-[var(--color-green)]/10',
  },
  blue: {
    border: 'border-[var(--color-yellow)]/25',
    glow: 'from-[var(--color-yellow)]/10',
  },
  pink: {
    border: 'border-[var(--color-violet-light)]/25',
    glow: 'from-[var(--color-violet-light)]/10',
  },
};

function StatCard({
  label,
  value,
  hint,
  accent = 'purple',
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  const style = ACCENT_STYLES[accent] || ACCENT_STYLES.purple;
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${style.glow} via-white/5 to-transparent border ${style.border} backdrop-blur-sm px-4 py-4 hover:border-white/20 transition-colors`}
    >
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-bold text-white tracking-tight">
        {typeof value === 'number' ? value.toString() : value}
      </p>
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function MatchLine({
  match,
  compact,
  showScore,
}: {
  match: SimpleMatch;
  compact?: boolean;
  showScore?: boolean;
}) {
  const t = useT('tournamentDetail');
  const locale = useLocale();
  const t1 = match.team1?.short_name || match.team1?.name || t.teamPlaceholder1;
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? t.byeLabel : t.teamPlaceholder2);

  const when = formatMatchDate(match.scheduled_at, locale);
  const isFinished = match.status === 'finished';

  let scoreLabel = '';
  if (showScore && isFinished) {
    const s1 = match.team1_score ?? 0;
    const s2 = match.team2_score ?? 0;
    scoreLabel = `${s1} - ${s2}`;
  }

  return (
    <Link href={`/match/${match.id}`}>
      <div className="group flex flex-col gap-1 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/8 hover:border-[var(--color-green)]/40 hover:bg-[var(--color-green)]/5 cursor-pointer transition-all text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-gray-100 truncate font-medium">
            {t1}{' '}
            {!match.is_bye && (
              <>
                <span className="text-gray-500 font-normal">{t.vsLabel}</span>{' '}
                {t2}
              </>
            )}
            {match.is_bye && (
              <span className="text-gray-500 font-normal"> {t.byeLabel}</span>
            )}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {scoreLabel && (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                {scoreLabel}
              </span>
            )}
            {match.match_format && (
              <span className="px-1.5 py-[2px] rounded bg-white/5 border border-white/8 text-[9px] text-gray-400 font-medium">
                {match.match_format.toUpperCase()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          {when && <span>{when}</span>}
          {match.round_name && (
            <>
              <span className="text-gray-700">·</span>
              <span>{match.round_name}</span>
            </>
          )}
          {match.stage && (
            <>
              <span className="text-gray-700">·</span>
              <span className="text-gray-500">{match.stage.name}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ---------------------------------------------------------------------------
 * SEO dynamique par-entité
 *
 * `getStaticProps` renvoie `props.seo` (SeoProps), privilégié par `_app.tsx`
 * sur la propriété statique `Component.seo` (repli dégradé). Le composant
 * `<Seo>` global gère canonical / og:url / og:image / twitter / site_name ;
 * on ne réémet donc plus de `<Head>` SEO manuel dans la page.
 *
 * JSON-LD : `SportsEvent` (un tournoi = un évènement sportif daté), avec
 * `eventStatus` corrigé (EventCancelled si annulé, sinon EventScheduled) et un
 * `offers` gratuit quand les inscriptions sont ouvertes.
 * -------------------------------------------------------------------------*/

const SEO_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://owwomenscup.fr';

// Statuts pour lesquels l'inscription d'une équipe reste possible (cohérent
// avec le bouton « Inscrire mon équipe » du rendu, qui s'affiche tant que le
// tournoi n'est ni terminé ni annulé).
const OPEN_REGISTRATION_STATUSES = new Set([
  'upcoming',
  'registration',
  'draft',
]);

function buildTournamentSeo(tournament: Tournament): SeoProps {
  const game = tournament.game || 'Overwatch';
  const dateLabelFr = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    'fr'
  );
  const dateLabelEn = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    'en'
  );
  const statusLabelFr = getStatusLabel(tournament.status);
  const statusLabelEn = getStatusLabelEn(tournament.status);

  const descriptionFr = [
    `${tournament.name} — tournoi ${game} OW Women's Cup`,
    dateLabelFr ? dateLabelFr.toLowerCase() : null,
    `(${statusLabelFr.toLowerCase()}).`,
    'Bracket, résultats, équipes et calendrier des matchs.',
  ]
    .filter(Boolean)
    .join(' ');

  const descriptionEn = [
    `${tournament.name} — ${game} tournament, OW Women's Cup`,
    dateLabelEn ? dateLabelEn.toLowerCase() : null,
    `(${statusLabelEn.toLowerCase()}).`,
    'Bracket, results, teams and match schedule.',
  ]
    .filter(Boolean)
    .join(' ');

  const canonicalUrl = `${SEO_BASE_URL}/tournament/${
    tournament.slug || tournament.id
  }`;

  const isCancelled = tournament.status === 'cancelled';
  const registrationOpen =
    !isCancelled && OPEN_REGISTRATION_STATUSES.has(tournament.status);

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: tournament.name,
    url: canonicalUrl,
    ...(tournament.start_date ? { startDate: tournament.start_date } : {}),
    ...(tournament.end_date ? { endDate: tournament.end_date } : {}),
    eventStatus: isCancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url: canonicalUrl,
    },
    organizer: {
      '@type': 'Organization',
      name: "OW Women's Cup",
      url: SEO_BASE_URL,
    },
    sport: game,
    inLanguage: 'fr-FR',
    ...(registrationOpen
      ? {
          offers: {
            '@type': 'Offer',
            availability: 'InStock',
            url: `${SEO_BASE_URL}/team/create?tournament=${tournament.id}`,
            price: '0',
            priceCurrency: 'EUR',
          },
        }
      : {}),
  };

  return {
    title: tournament.name,
    description: { fr: descriptionFr, en: descriptionEn },
    type: 'website',
    jsonLd,
  };
}

const tournamentSeoFallback: SeoProps = {
  title: { fr: 'Tournoi', en: 'Tournament' },
  description: {
    fr: "Suivez les tournois Overwatch de la OW Women's Cup : bracket, résultats, équipes et calendrier des matchs.",
    en: "Follow the OW Women's Cup Overwatch tournaments: bracket, results, teams and match schedule.",
  },
};

TournamentPage.seo = tournamentSeoFallback;

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

// Version francophone figée : utilisée uniquement par le SEO (buildTournamentSeo,
// hors contexte de hook). Le rendu visible passe par getStatusLabelT.
function getStatusLabel(status: string): string {
  switch (status) {
    case 'upcoming':
      return 'À venir';
    case 'running':
    case 'ongoing':
      return 'En cours';
    case 'finished':
    case 'completed':
      return 'Terminé';
    default:
      return status;
  }
}

// Pendant anglophone de getStatusLabel : utilisé uniquement par le SEO
// (buildTournamentSeo, hors contexte de hook). Miroir de la version FR.
function getStatusLabelEn(status: string): string {
  switch (status) {
    case 'upcoming':
      return 'Upcoming';
    case 'running':
    case 'ongoing':
      return 'Ongoing';
    case 'finished':
    case 'completed':
      return 'Completed';
    default:
      return status;
  }
}

// Version traduite pour le rendu visible (reçoit le dictionnaire du hook).
function getStatusLabelT(status: string, t: TournamentDetailDict): string {
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
  const base =
    'px-2 py-[3px] rounded-full text-[9px] font-bold uppercase tracking-wider';
  switch (status) {
    case 'upcoming':
      return `${base} bg-yellow-500/15 text-yellow-300 border border-yellow-500/40`;
    case 'running':
    case 'ongoing':
      return `${base} bg-emerald-500/15 text-emerald-300 border border-emerald-500/40`;
    case 'finished':
    case 'completed':
      return `${base} bg-gray-500/15 text-gray-300 border border-gray-500/30`;
    default:
      return `${base} bg-white/10 text-white border border-white/20`;
  }
}

function InfoCard({
  title,
  content,
  accent = 'purple',
}: {
  title: string;
  content: string;
  accent?: string;
}) {
  const style = ACCENT_STYLES[accent] || ACCENT_STYLES.purple;
  return (
    <div
      className={`bg-white/[0.03] backdrop-blur-sm border ${style.border} rounded-2xl p-5`}
    >
      <p className="text-[10px] uppercase tracking-widest text-gray-500 font-medium mb-3">
        {title}
      </p>
      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
        {content}
      </p>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
