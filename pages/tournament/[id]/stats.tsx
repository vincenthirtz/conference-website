// pages/tournament/[id]/stats.tsx

import { GetStaticPaths, GetStaticProps } from 'next';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { useT, format } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatDateRange } from '@/utils/tournamentDates';
import TournamentTabs from '@/components/tournament/TournamentTabs';

import { logger } from '../../../utils/logger';
import nsTournamentStats from '@/lib/i18n/locales/fr/tournamentStats';
type StatsDict = typeof nsTournamentStats.fr;
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

type SimpleTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

type MatchRow = {
  id: string;
  status: string;
  is_bye: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type GameRow = {
  match_id: string;
  team1_score: number | null;
  team2_score: number | null;
};

type TeamStat = {
  teamId: string;
  teamName: string;
  teamShortName?: string | null;
  logoUrl?: string | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winrate: number; // 0–1
  mapsWon: number;
  mapsLost: number;
  mapDiff: number;
};

type Props = {
  tournament: Tournament;
  teamStats: TeamStat[];
  hasFfaStage: boolean;
  seo: SeoProps;
};

// SEO par-entité : titre + description bilingues dédiés aux statistiques du
// tournoi. Retourné via `props.seo` (privilégié par `_app.tsx`).
function buildStatsSeo(tournament: Tournament): SeoProps {
  const name = tournament.name;
  return {
    title: { fr: `Statistiques – ${name}`, en: `Statistics – ${name}` },
    description: {
      fr: `Statistiques du tournoi ${name} — OW Women's Cup : classement des équipes, winrates, différentiel de maps et bilans victoires/défaites.`,
      en: `${name} tournament statistics — OW Women's Cup: team rankings, win rates, map differentials and win/loss records.`,
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

  // Phase A : tournoi (UUID ou slug)
  const tournament = await findTournamentByIdOrSlug<Tournament>(
    id,
    'id, slug, name, game, status, format, start_date, end_date, visibility',
    tenantId
  );
  if (!tournament) {
    return { notFound: true, revalidate: 60 };
  }
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }
  const tournamentId = tournament.id;

  // Phase B : stages + matches en parallèle
  const [stagesRes, matchesRes] = await Promise.all([
    supabaseAdmin
      .from('tournament_stages')
      .select('id, stage_type')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId),
    supabaseAdmin
      .from('matches')
      .select('id, status, is_bye, team1_id, team2_id, winner_team_id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled'),
  ]);

  if (matchesRes.error) {
    logger.error('stats page matches error:', matchesRes.error);
  }

  const hasFfaStage = (stagesRes.data || []).some(
    (s: any) => s.stage_type === 'ffa'
  );
  const stageIds = (stagesRes.data || []).map((s: any) => s.id);
  const matches = ((matchesRes.data || []) as MatchRow[]).filter(
    (m) => !m.is_bye
  );
  const matchIds = matches.map((m) => m.id);

  // Phase B : stage_teams + games en parallèle (dépend respectivement de stageIds / matchIds)
  const [stageTeamsRes, gamesRes] = await Promise.all([
    stageIds.length > 0
      ? supabaseAdmin
          .from('stage_teams')
          .select(
            `
          team:teams (
            id,
            name,
            short_name,
            logo_url
          )
        `
          )
          .eq('tenant_id', tenantId)
          .in('stage_id', stageIds)
      : Promise.resolve({ data: null as any, error: null }),
    matchIds.length > 0
      ? supabaseAdmin
          .from('games')
          .select('match_id, team1_score, team2_score')
          .eq('tenant_id', tenantId)
          .in('match_id', matchIds)
      : Promise.resolve({ data: [] as GameRow[], error: null }),
  ]);

  if (stageTeamsRes.error) {
    logger.error('stats page stage_teams error:', stageTeamsRes.error);
  }
  if (gamesRes.error) {
    logger.error('stats page games error:', gamesRes.error);
  }

  const teamMap = new Map<string, SimpleTeam>();
  (stageTeamsRes.data || []).forEach((row: any) => {
    if (!row.team) return;
    teamMap.set(row.team.id, row.team);
  });
  const teams = Array.from(teamMap.values());

  if (teams.length === 0) {
    return {
      props: {
        tournament: tournament as Tournament,
        teamStats: [],
        hasFfaStage,
        seo: buildStatsSeo(tournament as Tournament),
      },
      revalidate: 60,
    };
  }

  const games = (gamesRes.data || []) as GameRow[];
  const teamStats = computeTeamStats(teams, matches, games);

  return {
    props: {
      tournament: tournament as Tournament,
      teamStats,
      hasFfaStage,
      seo: buildStatsSeo(tournament as Tournament),
    },
    revalidate: 60,
  };
};

export default function TournamentStatsPage({
  tournament,
  teamStats,
  hasFfaStage,
}: Props) {
  const t = useT(nsTournamentStats);
  const { lang } = useLang();
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';
  const dateRangeLabel = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    lang
  );
  const statusLabel = getStatusLabel(tournament.status, t);
  const statusColor = getStatusChipColor(tournament.status);

  const totalTeams = teamStats.length;
  const totalMatches = teamStats.reduce((acc, t) => acc + t.matchesPlayed, 0);

  const sortedByWinrate = [...teamStats].sort((a, b) => {
    if (b.winrate !== a.winrate) {
      return b.winrate - a.winrate;
    }
    return b.matchesPlayed - a.matchesPlayed;
  });

  const topTeams = sortedByWinrate.slice(0, 3);

  const bestMapDiff = [...teamStats].sort((a, b) => b.mapDiff - a.mapDiff)[0];
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
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
                <span className="w-[1px] h-3 bg-white/20" />
                <span className={statusColor}>{statusLabel}</span>
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
                className="max-w-xl"
              >
                {t.description}
              </Paragraph>
            </div>
          </div>
        </section>

        <TournamentTabs
          tournamentPath={tournamentPath}
          active="stats"
          showPodium={isCompleted}
          showFfa={hasFfaStage}
        />

        {/* Stats globales */}
        <section className="mb-6">
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {teamStats.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                {t.empty}
              </Paragraph>
            )}

            {teamStats.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={t.statTeams} value={totalTeams} />
                <StatCard
                  label={t.statMatchesPlayed}
                  value={Math.round(totalMatches / 2)}
                  hint={format(t.hintParticipations, { count: totalMatches })}
                />
                <StatCard
                  label={t.statTopWinrate}
                  value={
                    topTeams[0]
                      ? `${(topTeams[0].winrate * 100).toFixed(0)}%`
                      : '—'
                  }
                  hint={
                    topTeams[0]
                      ? topTeams[0].teamShortName || topTeams[0].teamName
                      : undefined
                  }
                />
                <StatCard
                  label={t.statBestMapDiff}
                  value={
                    bestMapDiff
                      ? bestMapDiff.mapDiff > 0
                        ? `+${bestMapDiff.mapDiff}`
                        : bestMapDiff.mapDiff.toString()
                      : '—'
                  }
                  hint={
                    bestMapDiff
                      ? bestMapDiff.teamShortName || bestMapDiff.teamName
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        </section>

        {/* Top teams */}
        {topTeams.length > 0 && (
          <section className="mb-6">
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                {t.top3Heading}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {topTeams.map((t, index) => (
                  <TopTeamCard key={t.teamId} rank={index + 1} stat={t} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Tableau complet */}
        {teamStats.length > 0 && (
          <section>
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-3">
                {t.fullRankingHeading}
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th scope="col" className="text-left py-1.5 pr-3">
                        #
                      </th>
                      <th scope="col" className="text-left py-1.5 pr-3">
                        {t.colTeam}
                      </th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colMatches}
                      </th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colWins}
                      </th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colLosses}
                      </th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colWinrate}
                      </th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colMaps}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByWinrate.map((t, idx) => (
                      <tr
                        key={t.teamId}
                        className={
                          'border-b border-white/5' +
                          (idx % 2 === 0 ? ' bg-white/0' : ' bg-white/[0.02]')
                        }
                      >
                        <td className="py-1.5 pr-3 text-gray-400">{idx + 1}</td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
                              {t.logoUrl ? (
                                <Image
                                  src={t.logoUrl}
                                  alt={t.teamName}
                                  width={24}
                                  height={24}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-[9px] text-gray-400">
                                  {initials(t.teamShortName || t.teamName)}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-gray-100 text-[11px]">
                                {t.teamShortName || t.teamName}
                              </span>
                              {t.teamShortName && (
                                <span className="text-[10px] text-gray-500">
                                  {t.teamName}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {t.matchesPlayed}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {t.wins}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {t.losses}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {(t.winrate * 100).toFixed(0)}%
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {t.mapsWon}-{t.mapsLost}{' '}
                          <span
                            className={
                              'ml-1 ' +
                              (t.mapDiff > 0
                                ? 'text-emerald-300'
                                : t.mapDiff < 0
                                  ? 'text-red-300'
                                  : 'text-gray-300')
                            }
                          >
                            {t.mapDiff > 0
                              ? `(+${t.mapDiff})`
                              : t.mapDiff < 0
                                ? `(${t.mapDiff})`
                                : '(0)'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[10px] text-gray-500">{t.note}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Calcul des stats équipes
 * ────────────────────────────────────────────*/

function computeTeamStats(
  teams: SimpleTeam[],
  matches: MatchRow[],
  games: GameRow[]
): TeamStat[] {
  const matchById = new Map<string, MatchRow>();
  matches.forEach((m) => matchById.set(m.id, m));

  // Pré-agrégation des games par match
  const gameAgg = new Map<
    string,
    { team1Rounds: number; team2Rounds: number }
  >();
  for (const g of games) {
    const mId = g.match_id;
    const entry = gameAgg.get(mId) || {
      team1Rounds: 0,
      team2Rounds: 0,
    };
    entry.team1Rounds += g.team1_score ?? 0;
    entry.team2Rounds += g.team2_score ?? 0;
    gameAgg.set(mId, entry);
  }

  const stats: TeamStat[] = teams.map((t) => {
    let matchesPlayed = 0;
    let wins = 0;
    let losses = 0;
    let mapsWon = 0;
    let mapsLost = 0;

    for (const m of matches) {
      const isTeam1 = m.team1_id === t.id;
      const isTeam2 = m.team2_id === t.id;
      if (!isTeam1 && !isTeam2) continue;

      matchesPlayed += 1;

      if (m.winner_team_id) {
        if (m.winner_team_id === t.id) {
          wins += 1;
        } else {
          losses += 1;
        }
      }

      const g = gameAgg.get(m.id);
      if (g) {
        if (isTeam1) {
          mapsWon += g.team1Rounds;
          mapsLost += g.team2Rounds;
        } else if (isTeam2) {
          mapsWon += g.team2Rounds;
          mapsLost += g.team1Rounds;
        }
      }
    }

    const winrate = matchesPlayed > 0 ? wins / matchesPlayed : 0;

    return {
      teamId: t.id,
      teamName: t.name,
      teamShortName: t.short_name,
      logoUrl: t.logo_url,
      matchesPlayed,
      wins,
      losses,
      winrate,
      mapsWon,
      mapsLost,
      mapDiff: mapsWon - mapsLost,
    };
  });

  // On garde seulement les équipes ayant joué au moins un match
  return stats.filter((s) => s.matchesPlayed > 0);
}

/* ─────────────────────────────────────────────
 * UI components
 * ────────────────────────────────────────────*/

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/8 via-white/5 to-white/0 border border-white/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </p>
      <p className="text-xl font-semibold text-white">
        {typeof value === 'number' ? value.toString() : value}
      </p>
      {hint && <p className="text-[10px] text-gray-400 mt-[2px]">{hint}</p>}
    </div>
  );
}

function TopTeamCard({ rank, stat }: { rank: number; stat: TeamStat }) {
  const t = useT(nsTournamentStats);
  const rankLabel =
    rank === 1
      ? t.rankTeamFirst
      : rank === 2
        ? t.rankTeamSecond
        : t.rankTeamThird;

  const chipClass =
    rank === 1
      ? 'bg-yellow-500/20 border-yellow-400/60 text-yellow-100'
      : rank === 2
        ? 'bg-gray-300/15 border-gray-200/60 text-gray-100'
        : 'bg-amber-800/30 border-amber-500/60 text-amber-100';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className={
            'inline-flex items-center justify-center text-[10px] px-2 py-[2px] rounded-full border ' +
            chipClass
          }
        >
          {rankLabel}
        </span>
        <span className="text-[10px] text-gray-400">
          {format(t.winratePct, {
            rate: (stat.winrate * 100).toFixed(0),
          })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
          {stat.logoUrl ? (
            <Image
              src={stat.logoUrl}
              alt={stat.teamName}
              width={28}
              height={28}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[9px] text-gray-400">
              {initials(stat.teamShortName || stat.teamName)}
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white">
            {stat.teamShortName || stat.teamName}
          </span>
          {stat.teamShortName && (
            <span className="text-[10px] text-gray-400">{stat.teamName}</span>
          )}
        </div>
      </div>

      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-gray-300">
        <span>
          {t.matchesLabel}{' '}
          <span className="text-gray-100">{stat.matchesPlayed}</span>
        </span>
        <span>
          {t.wdLabel} <span className="text-emerald-300">{stat.wins}</span>/
          <span className="text-red-300">{stat.losses}</span>
        </span>
        <span>
          {t.mapsLabel}{' '}
          <span className="text-gray-100">
            {stat.mapsWon}-{stat.mapsLost}
          </span>{' '}
          <span
            className={
              stat.mapDiff > 0
                ? 'text-emerald-300'
                : stat.mapDiff < 0
                  ? 'text-red-300'
                  : 'text-gray-300'
            }
          >
            {stat.mapDiff > 0
              ? `(+${stat.mapDiff})`
              : stat.mapDiff < 0
                ? `(${stat.mapDiff})`
                : '(0)'}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Shared utils (comme sur les autres pages)
 * ────────────────────────────────────────────*/

function getStatusLabel(status: string, t: StatsDict): string {
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
