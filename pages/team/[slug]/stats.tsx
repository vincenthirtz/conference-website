// pages/team/[slug]/stats.tsx

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseAdmin } from '@/utils/supabase';
import type { MatchStatus } from '@/types/admin';

import { logger } from '../../../utils/logger';
type Team = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  created_at: string;
};

type TeamStatsView = {
  team_id: string;
  team_name: string;
  total_matches: number;
  wins: number;
  losses: number;
  winrate: number; // 0–1
  total_maps_won: number;
  total_maps_lost: number;
};

type MatchRow = {
  id: string;
  status: MatchStatus;
  is_bye: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type GameRow = {
  match_id: string;
  map_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

type MapStat = {
  mapName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winrate: number; // 0–1
  roundsFor: number;
  roundsAgainst: number;
  diff: number;
  overtimes: number;
  tiebreakers: number;
};

type Props = {
  team: Team;
  stats: TeamStatsView | null;
  mapStats: MapStat[];
  matchesPlayed: number;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;

  if (!slug || Array.isArray(slug)) {
    return { notFound: true };
  }

  const slugStr = slug as string;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slugStr
    );

  // 1) Team — by slug first, fall back to id for legacy UUID URLs
  let team: any = null;
  ({ data: team } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('slug', slugStr)
    .maybeSingle());

  if (!team && isUuid) {
    ({ data: team } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('id', slugStr)
      .maybeSingle());
  }

  if (!team) {
    return { notFound: true };
  }

  const teamId = team.id as string;

  // 2) Stats globales depuis la vue team_stats_view (si elle existe)
  let stats: TeamStatsView | null = null;
  try {
    const { data: statsData, error: sErr } = await supabaseAdmin
      .from('team_stats_view')
      .select('*')
      .eq('team_id', teamId)
      .maybeSingle();

    if (sErr) {
      logger.error('team_stats_view error:', sErr);
    } else if (statsData) {
      stats = statsData as TeamStatsView;
    }
  } catch (e) {
    logger.error('team_stats_view not available:', e);
  }

  // 3) Matches de l'équipe (tous tournois confondus, hors BYE)
  const { data: matchesData, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, status, is_bye, team1_id, team2_id, winner_team_id')
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .neq('status', 'cancelled');

  if (mErr) {
    logger.error('team stats matches error:', mErr);
  }

  const matches = ((matchesData || []) as MatchRow[]).filter((m) => !m.is_bye);
  const matchIds = matches.map((m) => m.id);

  // 4) Games de ces matches, pour calculer les stats par map
  let games: GameRow[] = [];
  if (matchIds.length > 0) {
    const { data: gamesData, error: gErr } = await supabaseAdmin
      .from('games')
      .select(
        'match_id, map_name, team1_score, team2_score, is_tiebreaker, went_overtime'
      )
      .in('match_id', matchIds);

    if (gErr) {
      logger.error('team stats games error:', gErr);
    } else {
      games = (gamesData || []) as GameRow[];
    }
  }

  const mapStats = computeMapStatsForTeam(teamId, matches, games);
  const matchesPlayed = matches.length;

  return {
    props: {
      team: team as Team,
      stats,
      mapStats,
      matchesPlayed,
    },
  };
};

export default function TeamStatsPage({
  team,
  stats,
  mapStats,
  matchesPlayed,
}: Props) {
  const name = team.name;
  const shortName = team.short_name || null;
  const logo = team.logo_url || null;

  const title = shortName ? `${shortName} – stats` : `${name} – stats`;

  const totalMatches = stats?.total_matches ?? matchesPlayed;
  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const winrate = stats ? stats.winrate * 100 : 0;

  const mapsWon = stats?.total_maps_won ?? 0;
  const mapsLost = stats?.total_maps_lost ?? 0;
  const mapDiff = mapsWon - mapsLost;

  const bestMap =
    mapStats.length > 0
      ? [...mapStats].sort(
          (a, b) => b.winrate - a.winrate || b.gamesPlayed - a.gamesPlayed
        )[0]
      : null;

  const mostPlayed = mapStats.length > 0 ? mapStats[0] : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{title} | OW Women&apos;s Cup</title>
      </Head>

      <main className="container mx-auto px-4 pt-24 pb-16 max-w-5xl">
        {/* HERO */}
        <section className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-black/60 border border-white/15 flex items-center justify-center overflow-hidden">
                {logo ? (
                  <Image
                    src={logo}
                    alt={name}
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base font-semibold text-gray-300">
                    {initials(shortName || name)}
                  </span>
                )}
              </div>
              <div>
                <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-wide mb-1">
                  <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-emerald-400/90 to-cyan-400/90 text-black font-semibold">
                    Stats équipe
                  </span>
                </div>

                <Heading
                  typeStyle="heading-md"
                  className="text-gradient mb-0.5"
                >
                  {shortName || name}
                </Heading>
                {shortName && (
                  <p className="text-[11px] text-gray-400">{name}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Link href={`/team/${team.id}`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-blue-400"
                >
                  ← Fiche équipe
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Matchs joués" value={totalMatches} />
            <StatCard label="Bilan" value={`${wins} - ${losses}`} />
            <StatCard
              label="Winrate"
              value={totalMatches > 0 ? `${winrate.toFixed(0)}%` : '—'}
            />
            <StatCard
              label="Maps"
              value={`${mapsWon}-${mapsLost}`}
              hint={
                totalMatches > 0
                  ? mapDiff > 0
                    ? `+${mapDiff} diff`
                    : mapDiff < 0
                      ? `${mapDiff} diff`
                      : 'diff neutre'
                  : undefined
              }
            />
          </div>
        </section>

        {/* MAPS SUMMARY */}
        <section className="mb-8">
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {mapStats.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                Pas encore assez de données de maps enregistrées pour calculer
                des statistiques détaillées.
              </Paragraph>
            )}

            {mapStats.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                  Profil de maps de l&apos;équipe
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <StatCard label="Maps distinctes" value={mapStats.length} />
                  <StatCard
                    label="Games maps"
                    value={mapStats.reduce((acc, m) => acc + m.gamesPlayed, 0)}
                  />
                  <StatCard
                    label="Map préférée"
                    value={bestMap ? bestMap.mapName : '—'}
                    hint={
                      bestMap
                        ? `${bestMap.gamesPlayed} games · ${(bestMap.winrate * 100).toFixed(0)}% WR`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Map la plus jouée"
                    value={mostPlayed ? mostPlayed.mapName : '—'}
                    hint={
                      mostPlayed ? `${mostPlayed.gamesPlayed} games` : undefined
                    }
                  />
                </div>
                <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                  Les statistiques sont calculées sur l&apos;ensemble des matchs
                  joués (tous tournois confondus) et enregistrés dans la base de
                  données.
                </Paragraph>
              </>
            )}
          </div>
        </section>

        {/* MAPS TABLE */}
        {mapStats.length > 0 && (
          <section>
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-3">
                Stats détaillées par map
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th className="text-left py-1.5 pr-3">Map</th>
                      <th className="text-right py-1.5 px-3">Games</th>
                      <th className="text-right py-1.5 px-3">W</th>
                      <th className="text-right py-1.5 px-3">L</th>
                      <th className="text-right py-1.5 px-3">Winrate</th>
                      <th className="text-right py-1.5 px-3">Rounds (+/-)</th>
                      <th className="text-right py-1.5 px-3">OTs</th>
                      <th className="text-right py-1.5 pl-3">Tiebreakers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapStats.map((m, idx) => (
                      <tr
                        key={m.mapName}
                        className={
                          'border-b border-white/5' +
                          (idx % 2 === 0 ? ' bg-white/0' : ' bg-white/[0.02]')
                        }
                      >
                        <td className="py-1.5 pr-3 text-gray-100">
                          {m.mapName}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.gamesPlayed}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.wins}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.losses}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {(m.winrate * 100).toFixed(0)}%
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.roundsFor}-{m.roundsAgainst}{' '}
                          <span
                            className={
                              'ml-1 ' +
                              (m.diff > 0
                                ? 'text-emerald-300'
                                : m.diff < 0
                                  ? 'text-red-300'
                                  : 'text-gray-300')
                            }
                          >
                            {m.diff > 0
                              ? `(+${m.diff})`
                              : m.diff < 0
                                ? `(${m.diff})`
                                : '(0)'}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.overtimes}
                        </td>
                        <td className="py-1.5 pl-3 text-right text-gray-100">
                          {m.tiebreakers}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[10px] text-gray-500">
                Les overtimes et tiebreakers sont comptés à partir des flags
                stockés sur chaque game.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Calcul des stats par map pour une équipe
 * ────────────────────────────────────────────*/

function computeMapStatsForTeam(
  teamId: string,
  matches: MatchRow[],
  games: GameRow[]
): MapStat[] {
  const matchById = new Map<string, MatchRow>();
  matches.forEach((m) => matchById.set(m.id, m));

  type Agg = {
    games: number;
    wins: number;
    losses: number;
    roundsFor: number;
    roundsAgainst: number;
    overtimes: number;
    tiebreakers: number;
  };

  const mapAgg = new Map<string, Agg>();

  for (const g of games) {
    if (!g.map_name) continue;
    const match = matchById.get(g.match_id);
    if (!match) continue;

    const isTeam1 = match.team1_id === teamId;
    const isTeam2 = match.team2_id === teamId;

    if (!isTeam1 && !isTeam2) continue;

    const key = g.map_name;
    const entry = mapAgg.get(key) || {
      games: 0,
      wins: 0,
      losses: 0,
      roundsFor: 0,
      roundsAgainst: 0,
      overtimes: 0,
      tiebreakers: 0,
    };

    entry.games += 1;

    const s1 = g.team1_score ?? 0;
    const s2 = g.team2_score ?? 0;

    if (isTeam1) {
      entry.roundsFor += s1;
      entry.roundsAgainst += s2;
      if (s1 > s2) entry.wins += 1;
      else if (s1 < s2) entry.losses += 1;
    } else if (isTeam2) {
      entry.roundsFor += s2;
      entry.roundsAgainst += s1;
      if (s2 > s1) entry.wins += 1;
      else if (s2 < s1) entry.losses += 1;
    }

    if (g.went_overtime) entry.overtimes += 1;
    if (g.is_tiebreaker) entry.tiebreakers += 1;

    mapAgg.set(key, entry);
  }

  const list: MapStat[] = Array.from(mapAgg.entries()).map(
    ([mapName, entry]) => ({
      mapName,
      gamesPlayed: entry.games,
      wins: entry.wins,
      losses: entry.losses,
      winrate: entry.games > 0 ? entry.wins / entry.games : 0,
      roundsFor: entry.roundsFor,
      roundsAgainst: entry.roundsAgainst,
      diff: entry.roundsFor - entry.roundsAgainst,
      overtimes: entry.overtimes,
      tiebreakers: entry.tiebreakers,
    })
  );

  list.sort((a, b) => {
    if (b.gamesPlayed !== a.gamesPlayed) {
      return b.gamesPlayed - a.gamesPlayed;
    }
    return b.winrate - a.winrate;
  });

  return list;
}

/* ─────────────────────────────────────────────
 * UI utils
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
