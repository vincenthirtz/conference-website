// pages/tournament/[id]/maps.tsx

import { GetStaticPaths, GetStaticProps } from 'next';
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
type MapsDict = ReturnType<typeof useT<'tournamentMaps'>>;
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

type MatchRow = {
  id: string;
  status: string;
  is_bye: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
};

type VetoRow = {
  match_id: string;
  action: string;
  team_id: string | null;
  map_name: string;
};

type TeamMini = {
  id: string;
  name: string;
};

type GameRow = {
  match_id: string;
  map_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

type TeamMapWinrate = {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winrate: number;
};

type MapStat = {
  mapName: string;
  gamesPlayed: number;
  totalRounds: number;
  avgRounds: number;
  overtimes: number;
  overtimesRate: number; // 0–1
  tiebreakers: number;
  // Veto stats
  timesBanned: number;
  timesPicked: number;
  timesDecider: number;
  banRate: number;
  pickRate: number;
  // Team winrates
  teamWinrates: TeamMapWinrate[];
};

type Props = {
  tournament: Tournament;
  maps: MapStat[];
  hasVetoData: boolean;
  hasFfaStage: boolean;
  seo: SeoProps;
};

// SEO par-entité : titre + description bilingues dédiés aux maps du tournoi.
// Retourné via `props.seo` (privilégié par `_app.tsx`).
function buildMapsSeo(tournament: Tournament): SeoProps {
  const name = tournament.name;
  return {
    title: { fr: `Maps – ${name}`, en: `Maps – ${name}` },
    description: {
      fr: `Top maps du tournoi ${name} — OW Women's Cup : maps les plus jouées, bans, picks, prolongations et winrates par équipe.`,
      en: `Top maps of the ${name} tournament — OW Women's Cup: most played maps, bans, picks, overtimes and per-team win rates.`,
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

  // 2) Matches du tournoi + phases (pour l'onglet FFA)
  const [matchesRes, stagesRes] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select('id, status, is_bye, team1_id, team2_id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled'),
    supabaseAdmin
      .from('tournament_stages')
      .select('stage_type')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId),
  ]);

  if (matchesRes.error) {
    logger.error('maps page matches error:', matchesRes.error);
  }

  const hasFfaStage = (stagesRes.data || []).some(
    (s: any) => s.stage_type === 'ffa'
  );

  const allMatches = (matchesRes.data || []) as MatchRow[];
  const matches = allMatches.filter((m) => !m.is_bye);
  const matchIds = matches.map((m) => m.id);

  const teamIdSet = new Set<string>();
  for (const m of matches) {
    if (m.team1_id) teamIdSet.add(m.team1_id);
    if (m.team2_id) teamIdSet.add(m.team2_id);
  }

  let maps: MapStat[] = [];
  let hasVetoData = false;

  if (matchIds.length > 0) {
    // 2) Games + vetos + teams en parallèle
    const [gamesRes, vetoRes, teamsRes] = await Promise.all([
      supabaseAdmin
        .from('games')
        .select(
          'match_id, map_name, team1_score, team2_score, is_tiebreaker, went_overtime'
        )
        .eq('tenant_id', tenantId)
        .in('match_id', matchIds),
      supabaseAdmin
        .from('match_map_vetos')
        .select('match_id, action, team_id, map_name')
        .eq('tenant_id', tenantId)
        .in('match_id', matchIds),
      teamIdSet.size > 0
        ? supabaseAdmin
            .from('teams')
            .select('id, name')
            .eq('tenant_id', tenantId)
            .in('id', Array.from(teamIdSet))
        : Promise.resolve({ data: [] as TeamMini[], error: null }),
    ]);

    let vetos: VetoRow[] = [];
    if (!vetoRes.error && vetoRes.data) {
      vetos = vetoRes.data as VetoRow[];
      hasVetoData = vetos.length > 0;
    }

    const teamNames = new Map<string, string>();
    for (const t of (teamsRes.data || []) as TeamMini[]) {
      teamNames.set(t.id, t.name);
    }

    const matchById = new Map<string, MatchRow>();
    matches.forEach((m) => matchById.set(m.id, m));

    if (!gamesRes.error) {
      const games = (gamesRes.data || []) as GameRow[];
      maps = computeMapStats(games, vetos, matchById, teamNames);
    }
  }

  return {
    props: {
      tournament: tournament as Tournament,
      maps,
      hasVetoData,
      hasFfaStage,
      seo: buildMapsSeo(tournament as Tournament),
    },
    revalidate: 60,
  };
};

export default function TournamentMapsPage({
  tournament,
  maps,
  hasVetoData,
  hasFfaStage,
}: Props) {
  const t = useT('tournamentMaps');
  const { lang } = useLang();
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';
  const dateRangeLabel = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    lang
  );
  const statusLabel = getStatusLabel(tournament.status, t);
  const statusColor = getStatusChipColor(tournament.status);

  const totalMaps = maps.length;
  const totalGames = maps.reduce((acc, m) => acc + m.gamesPlayed, 0);
  const bestMaps = maps.slice(0, 3);

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
          active="maps"
          showPodium={isCompleted}
          showFfa={hasFfaStage}
        />

        {/* Stats globales */}
        <section className="mb-6">
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {totalGames === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                {t.emptyGames}
              </Paragraph>
            )}

            {totalGames > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={t.statDistinctMaps} value={totalMaps} />
                <StatCard label={t.statGamesPlayed} value={totalGames} />
                <StatCard
                  label={t.statOvertimes}
                  value={maps.reduce((acc, m) => acc + m.overtimes, 0)}
                />
                <StatCard
                  label={t.statTiebreakers}
                  value={maps.reduce((acc, m) => acc + m.tiebreakers, 0)}
                />
                {hasVetoData && (
                  <>
                    <StatCard
                      label={t.statTotalBans}
                      value={maps.reduce((acc, m) => acc + m.timesBanned, 0)}
                    />
                    <StatCard
                      label={t.statMostBanned}
                      value={
                        [...maps].sort(
                          (a, b) => b.timesBanned - a.timesBanned
                        )[0]?.mapName || '—'
                      }
                      hint={
                        [...maps].sort(
                          (a, b) => b.timesBanned - a.timesBanned
                        )[0]
                          ? format(t.hintBans, {
                              count: [...maps].sort(
                                (a, b) => b.timesBanned - a.timesBanned
                              )[0].timesBanned,
                            })
                          : undefined
                      }
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Top 3 */}
        {bestMaps.length > 0 && (
          <section className="mb-6">
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                {t.top3Heading}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {bestMaps.map((m, index) => (
                  <TopMapCard key={m.mapName} rank={index + 1} stat={m} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Tableau complet */}
        {totalGames > 0 && (
          <section>
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-3">
                {t.allMapsHeading}
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th scope="col" className="text-left py-1.5 pr-3">
                        {t.colMap}
                      </th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colGames}
                      </th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colAvgRounds}
                      </th>
                      <th scope="col" className="text-right py-1.5 px-3">
                        {t.colOvertimes}
                      </th>
                      {hasVetoData && (
                        <>
                          <th scope="col" className="text-right py-1.5 px-3">
                            {t.colBans}
                          </th>
                          <th scope="col" className="text-right py-1.5 px-3">
                            {t.colPicks}
                          </th>
                        </>
                      )}
                      <th scope="col" className="text-right py-1.5 pl-3">
                        {t.colWinrates}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {maps.map((m, idx) => (
                      <tr
                        key={m.mapName}
                        className={
                          'border-b border-white/5' +
                          (idx % 2 === 0 ? ' bg-white/0' : ' bg-white/[0.02]')
                        }
                      >
                        <td className="py-1.5 pr-3">
                          <span className="text-gray-100">{m.mapName}</span>
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.gamesPlayed}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.avgRounds.toFixed(1)}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <span className="text-gray-100">{m.overtimes}</span>
                          <span className="text-[10px] text-gray-500 ml-1">
                            ({(m.overtimesRate * 100).toFixed(0)}%)
                          </span>
                        </td>
                        {hasVetoData && (
                          <>
                            <td className="py-1.5 px-3 text-right">
                              <span className="text-red-300">
                                {m.timesBanned}
                              </span>
                              <span className="text-[10px] text-gray-500 ml-1">
                                ({(m.banRate * 100).toFixed(0)}%)
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              <span className="text-emerald-300">
                                {m.timesPicked}
                              </span>
                              {m.timesDecider > 0 && (
                                <span className="text-[10px] text-yellow-400 ml-1">
                                  +{m.timesDecider}d
                                </span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="py-1.5 pl-3 text-right">
                          {m.teamWinrates.length > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              {m.teamWinrates.slice(0, 3).map((tw) => (
                                <span key={tw.teamId} className="text-[10px]">
                                  <span className="text-gray-400">
                                    {tw.teamName}
                                  </span>{' '}
                                  <span
                                    className={
                                      tw.winrate >= 0.5
                                        ? 'text-emerald-300'
                                        : 'text-red-300'
                                    }
                                  >
                                    {(tw.winrate * 100).toFixed(0)}%
                                  </span>
                                  <span className="text-gray-500 ml-0.5">
                                    {format(t.winLossAbbrev, {
                                      wins: tw.wins,
                                      losses: tw.losses,
                                    })}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
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
 * Calcul des stats de maps
 * ────────────────────────────────────────────*/

function computeMapStats(
  games: GameRow[],
  vetos: VetoRow[],
  matchById: Map<string, MatchRow>,
  teamNames: Map<string, string>
): MapStat[] {
  type GameAgg = {
    games: number;
    totalRounds: number;
    overtimes: number;
    tiebreakers: number;
  };

  type TeamAgg = { gamesPlayed: number; wins: number; losses: number };

  const gameAgg = new Map<string, GameAgg>();
  const teamMapAgg = new Map<string, Map<string, TeamAgg>>();

  for (const g of games) {
    if (!g.map_name) continue;
    const key = g.map_name;
    const entry = gameAgg.get(key) || {
      games: 0,
      totalRounds: 0,
      overtimes: 0,
      tiebreakers: 0,
    };

    entry.games += 1;
    const r1 = g.team1_score ?? 0;
    const r2 = g.team2_score ?? 0;
    entry.totalRounds += r1 + r2;
    if (g.went_overtime) entry.overtimes += 1;
    if (g.is_tiebreaker) entry.tiebreakers += 1;
    gameAgg.set(key, entry);

    // Per-team winrate on this map
    const match = matchById.get(g.match_id);
    if (match && r1 !== r2) {
      const winnerId = r1 > r2 ? match.team1_id : match.team2_id;
      const loserId = r1 > r2 ? match.team2_id : match.team1_id;

      if (!teamMapAgg.has(key)) teamMapAgg.set(key, new Map());
      const mapTeams = teamMapAgg.get(key)!;

      for (const [teamId, isWin] of [
        [winnerId, true],
        [loserId, false],
      ] as [string | null, boolean][]) {
        if (!teamId) continue;
        const ta = mapTeams.get(teamId) || {
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
        };
        ta.gamesPlayed += 1;
        if (isWin) ta.wins += 1;
        else ta.losses += 1;
        mapTeams.set(teamId, ta);
      }
    }
  }

  // Veto aggregation
  const vetoMatchIds = new Set(vetos.map((v) => v.match_id));
  const totalVetoMatches = vetoMatchIds.size;

  type VetoAgg = { bans: number; picks: number; deciders: number };
  const vetoAgg = new Map<string, VetoAgg>();
  for (const v of vetos) {
    const entry = vetoAgg.get(v.map_name) || { bans: 0, picks: 0, deciders: 0 };
    if (v.action === 'ban') entry.bans += 1;
    else if (v.action === 'pick') entry.picks += 1;
    else if (v.action === 'decider') entry.deciders += 1;
    vetoAgg.set(v.map_name, entry);
  }

  // Merge all map names
  const allMapNames = new Set<string>();
  gameAgg.forEach((_, k) => allMapNames.add(k));

  const list: MapStat[] = Array.from(allMapNames).map((mapName) => {
    const ge = gameAgg.get(mapName)!;
    const ve = vetoAgg.get(mapName);
    const avgRounds = ge.games > 0 ? ge.totalRounds / ge.games : 0;
    const overtimesRate = ge.games > 0 ? ge.overtimes / ge.games : 0;

    // Build team winrates
    const teamWinrates: TeamMapWinrate[] = [];
    const mapTeams = teamMapAgg.get(mapName);
    if (mapTeams) {
      mapTeams.forEach((ta, teamId) => {
        teamWinrates.push({
          teamId,
          teamName: teamNames.get(teamId) || teamId,
          gamesPlayed: ta.gamesPlayed,
          wins: ta.wins,
          losses: ta.losses,
          winrate: ta.gamesPlayed > 0 ? ta.wins / ta.gamesPlayed : 0,
        });
      });
      teamWinrates.sort((a, b) => {
        if (b.winrate !== a.winrate) return b.winrate - a.winrate;
        return b.gamesPlayed - a.gamesPlayed;
      });
    }

    return {
      mapName,
      gamesPlayed: ge.games,
      totalRounds: ge.totalRounds,
      avgRounds,
      overtimes: ge.overtimes,
      overtimesRate,
      tiebreakers: ge.tiebreakers,
      timesBanned: ve?.bans ?? 0,
      timesPicked: ve?.picks ?? 0,
      timesDecider: ve?.deciders ?? 0,
      banRate: totalVetoMatches > 0 ? (ve?.bans ?? 0) / totalVetoMatches : 0,
      pickRate: totalVetoMatches > 0 ? (ve?.picks ?? 0) / totalVetoMatches : 0,
      teamWinrates,
    };
  });

  list.sort((a, b) => {
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    return b.totalRounds - a.totalRounds;
  });

  return list;
}

/* ─────────────────────────────────────────────
 * UI components locaux
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

function TopMapCard({ rank, stat }: { rank: number; stat: MapStat }) {
  const t = useT('tournamentMaps');
  const rankLabel =
    rank === 1 ? t.rankMapFirst : rank === 2 ? t.rankMapSecond : t.rankMapThird;

  const chipClass =
    rank === 1
      ? 'bg-yellow-500/20 border-yellow-400/60 text-yellow-100'
      : rank === 2
        ? 'bg-gray-300/15 border-gray-200/60 text-gray-100'
        : 'bg-amber-800/30 border-amber-500/60 text-amber-100';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span
          className={
            'inline-flex items-center justify-center text-[10px] px-2 py-[2px] rounded-full border ' +
            chipClass
          }
        >
          {rankLabel}
        </span>
        <span className="text-[10px] text-gray-400">
          {format(
            stat.gamesPlayed > 1 ? t.gamesCount_other : t.gamesCount_one,
            { count: stat.gamesPlayed }
          )}
        </span>
      </div>
      <p className="text-sm font-semibold text-white">{stat.mapName}</p>
      <div className="flex flex-wrap gap-2 text-[10px] text-gray-300 mt-1">
        <span>
          {t.avgRoundsLabel}{' '}
          <span className="text-gray-100">{stat.avgRounds.toFixed(1)}</span>
        </span>
        <span>
          {t.overtimesLabel}{' '}
          <span className="text-gray-100">{stat.overtimes}</span>{' '}
          <span className="text-gray-500">
            ({(stat.overtimesRate * 100).toFixed(0)}
            %)
          </span>
        </span>
        {stat.timesBanned > 0 && (
          <span>
            {t.bansLabel}{' '}
            <span className="text-red-300">{stat.timesBanned}</span>
          </span>
        )}
        {stat.timesPicked > 0 && (
          <span>
            {t.picksLabel}{' '}
            <span className="text-emerald-300">{stat.timesPicked}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Shared utils (cohérents avec les autres pages)
 * ────────────────────────────────────────────*/

function getStatusLabel(status: string, t: MapsDict): string {
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
