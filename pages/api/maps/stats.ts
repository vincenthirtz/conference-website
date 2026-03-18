// pages/api/maps/stats.ts
// API publique "Top maps du tournoi"
// - stats par map à partir des games
// - veto stats (bans/picks) à partir de match_map_vetos
// - team winrates par map
// - filtré sur un tournoi donné
// - ignore les BYE et les matchs annulés

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import type { MatchStatus } from '@/types/admin';
import { parsePagination, isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

/* -----------------------------------------------------------
 * Types
 * ---------------------------------------------------------*/

type MatchRow = {
  id: string;
  tournament_id: string;
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
  winner_team_id: string | null;
  duration_minutes: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

type VetoRow = {
  match_id: string;
  action: string;
  team_id: string | null;
  map_name: string;
};

export type TeamMapWinrate = {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winrate: number; // 0–1
};

export type MapTopStat = {
  mapName: string;
  gamesPlayed: number;
  totalRounds: number;
  avgRounds: number;
  avgDuration: number | null; // average game duration in minutes
  overtimes: number;
  tiebreakers: number;
  usageRate: number; // 0–1
  // Veto stats
  timesBanned: number;
  timesPicked: number;
  timesDecider: number;
  banRate: number; // 0–1 (bans / total veto matches)
  pickRate: number; // 0–1
  // Team winrates on this map
  teamWinrates: TeamMapWinrate[];
};

export type TeamMapTendency = {
  teamId: string;
  teamName: string;
  totalVetos: number; // number of veto sequences this team participated in
  bans: { mapName: string; count: number; rate: number }[];
  picks: { mapName: string; count: number; rate: number }[];
};

export type MapsStatsApiResponse = {
  tournamentId: string;
  totalGames: number;
  totalVetoMatches: number;
  maps: MapTopStat[];
  neverPlayed: string[]; // maps in pool but never played in a game
  teamTendencies: TeamMapTendency[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'map-stats')) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tournamentId, minGames } = req.query;

  if (!tournamentId || Array.isArray(tournamentId) || !isValidUUID(tournamentId)) {
    return res.status(400).json({
      error: "Query parameter 'tournamentId' is required and must be a valid UUID",
    });
  }

  const { limit: limitNum } = parsePagination(req, { limit: 20 });
  const minGamesNum = parseInt(
    (Array.isArray(minGames) ? minGames[0] : minGames) ?? '1',
    10
  );

  try {
    // 1) Récupérer les matches du tournoi (hors annulés, hors BYE)
    const { data: matchesData, error: mErr } = await supabaseAdmin
      .from('matches')
      .select('id, tournament_id, status, is_bye, team1_id, team2_id, winner_team_id')
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled');

    if (mErr) {
      console.error('/api/maps/stats matches error:', mErr);
      return res.status(500).json({
        error: 'Failed to fetch matches',
      });
    }

    const matches = ((matchesData || []) as MatchRow[]).filter(
      (m) => !m.is_bye
    );
    const matchIds = matches.map((m) => m.id);

    if (matchIds.length === 0) {
      const empty: MapsStatsApiResponse = {
        tournamentId,
        totalGames: 0,
        totalVetoMatches: 0,
        maps: [],
        neverPlayed: [],
        teamTendencies: [],
      };
      return res.status(200).json(empty);
    }

    // 2) Récupérer toutes les games pour ces matches
    const { data: gamesData, error: gErr } = await supabaseAdmin
      .from('games')
      .select(
        'match_id, map_name, team1_score, team2_score, winner_team_id, duration_minutes, is_tiebreaker, went_overtime'
      )
      .in('match_id', matchIds);

    if (gErr) {
      console.error('/api/maps/stats games error:', gErr);
      return res.status(500).json({
        error: 'Failed to fetch games',
      });
    }

    const games = (gamesData || []) as GameRow[];

    // 3) Récupérer les vetos pour ces matches
    let vetos: VetoRow[] = [];
    const { data: vetoData, error: vErr } = await supabaseAdmin
      .from('match_map_vetos')
      .select('match_id, action, team_id, map_name')
      .in('match_id', matchIds);

    if (!vErr && vetoData) {
      vetos = vetoData as VetoRow[];
    }

    // Count unique matches with vetos
    const vetoMatchIds = new Set(vetos.map((v) => v.match_id));
    const totalVetoMatches = vetoMatchIds.size;

    // 4) Fetch team names for winrate display
    const teamIdSet = new Set<string>();
    for (const m of matches) {
      if (m.team1_id) teamIdSet.add(m.team1_id);
      if (m.team2_id) teamIdSet.add(m.team2_id);
    }
    const teamNames = new Map<string, string>();
    if (teamIdSet.size > 0) {
      const { data: teamsData } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .in('id', Array.from(teamIdSet));
      for (const t of teamsData || []) {
        teamNames.set(t.id, t.name);
      }
    }

    // 5) Build match lookup
    const matchById = new Map<string, MatchRow>();
    matches.forEach((m) => matchById.set(m.id, m));

    // 6) Calcul des stats par map
    const stats = computeMapStats(games, vetos, totalVetoMatches, matchById, teamNames);
    const totalGames = stats.reduce((sum, m) => sum + m.gamesPlayed, 0);

    // 7) Calcul du taux d'utilisation + filtres
    const withUsage: MapTopStat[] = stats.map((s) => ({
      ...s,
      usageRate: totalGames > 0 ? s.gamesPlayed / totalGames : 0,
    }));

    let filtered = withUsage.filter((m) => m.gamesPlayed >= minGamesNum);

    // Tri : par nombre de games desc, puis usageRate desc, puis nom
    filtered.sort((a, b) => {
      if (b.gamesPlayed !== a.gamesPlayed) {
        return b.gamesPlayed - a.gamesPlayed;
      }
      if (b.usageRate !== a.usageRate) {
        return b.usageRate - a.usageRate;
      }
      return a.mapName.localeCompare(b.mapName);
    });

    if (limitNum > 0) {
      filtered = filtered.slice(0, limitNum);
    }

    // 8) Never-played maps: maps in the tournament pool with 0 games
    const playedMapNames = new Set(stats.filter((s) => s.gamesPlayed > 0).map((s) => s.mapName));
    let neverPlayed: string[] = [];
    {
      const { data: poolData } = await supabaseAdmin
        .from('tournament_maps')
        .select('map_name')
        .eq('tournament_id', tournamentId)
        .eq('enabled', true);

      if (poolData) {
        neverPlayed = poolData
          .map((m: any) => m.map_name as string)
          .filter((name: string) => !playedMapNames.has(name))
          .sort();
      }
    }

    // 9) Team tendencies: per-team ban/pick patterns from vetos
    const teamTendencies = computeTeamTendencies(vetos, teamNames);

    const response: MapsStatsApiResponse = {
      tournamentId,
      totalGames,
      totalVetoMatches,
      maps: filtered,
      neverPlayed,
      teamTendencies,
    };

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=120');
    return res.status(200).json(response);
  } catch (err: unknown) {
    console.error('[/api/maps/stats] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* -----------------------------------------------------------
 * Calcul des stats globales par map
 * ---------------------------------------------------------*/

function computeMapStats(
  games: GameRow[],
  vetos: VetoRow[],
  totalVetoMatches: number,
  matchById: Map<string, MatchRow>,
  teamNames: Map<string, string>
): MapTopStat[] {
  type GameAgg = {
    games: number;
    totalRounds: number;
    overtimes: number;
    tiebreakers: number;
    totalDuration: number;
    durationCount: number;
  };

  type TeamAgg = {
    gamesPlayed: number;
    wins: number;
    losses: number;
  };

  const gameAgg = new Map<string, GameAgg>();
  // Map -> TeamId -> TeamAgg
  const teamMapAgg = new Map<string, Map<string, TeamAgg>>();

  for (const g of games) {
    if (!g.map_name) continue;

    const key = g.map_name;
    const entry = gameAgg.get(key) || {
      games: 0,
      totalRounds: 0,
      overtimes: 0,
      tiebreakers: 0,
      totalDuration: 0,
      durationCount: 0,
    };

    entry.games += 1;
    const s1 = g.team1_score ?? 0;
    const s2 = g.team2_score ?? 0;
    entry.totalRounds += s1 + s2;
    if (g.went_overtime) entry.overtimes += 1;
    if (g.is_tiebreaker) entry.tiebreakers += 1;
    if (g.duration_minutes != null) {
      entry.totalDuration += g.duration_minutes;
      entry.durationCount += 1;
    }
    gameAgg.set(key, entry);

    // Per-team winrate on this map
    const match = matchById.get(g.match_id);
    if (match) {
      // Determine winner: use winner_team_id if set, else fall back to scores
      let winnerId: string | null = null;
      let loserId: string | null = null;
      if (g.winner_team_id) {
        winnerId = g.winner_team_id;
        loserId =
          g.winner_team_id === match.team1_id
            ? match.team2_id
            : match.team1_id;
      } else if (s1 !== s2) {
        winnerId = s1 > s2 ? match.team1_id : match.team2_id;
        loserId = s1 > s2 ? match.team2_id : match.team1_id;
      }

      if (winnerId) {
        if (!teamMapAgg.has(key)) teamMapAgg.set(key, new Map());
        const mapTeams = teamMapAgg.get(key)!;

        for (const [teamId, isWin] of [
          [winnerId, true],
          [loserId, false],
        ] as [string | null, boolean][]) {
          if (!teamId) continue;
          const ta = mapTeams.get(teamId) || { gamesPlayed: 0, wins: 0, losses: 0 };
          ta.gamesPlayed += 1;
          if (isWin) ta.wins += 1;
          else ta.losses += 1;
          mapTeams.set(teamId, ta);
        }
      }
    }
  }

  // Veto aggregation
  type VetoAgg = {
    bans: number;
    picks: number;
    deciders: number;
  };

  const vetoAgg = new Map<string, VetoAgg>();
  for (const v of vetos) {
    const entry = vetoAgg.get(v.map_name) || { bans: 0, picks: 0, deciders: 0 };
    if (v.action === 'ban') entry.bans += 1;
    else if (v.action === 'pick') entry.picks += 1;
    else if (v.action === 'decider') entry.deciders += 1;
    vetoAgg.set(v.map_name, entry);
  }

  // Merge all map names from games + vetos
  const allMapNames = new Set<string>();
  gameAgg.forEach((_, k) => allMapNames.add(k));
  vetoAgg.forEach((_, k) => allMapNames.add(k));

  const list: MapTopStat[] = Array.from(allMapNames).map((mapName) => {
    const ge = gameAgg.get(mapName);
    const ve = vetoAgg.get(mapName);
    const gamesPlayed = ge?.games ?? 0;
    const avgRounds = gamesPlayed > 0 ? (ge?.totalRounds ?? 0) / gamesPlayed : 0;
    const avgDuration =
      ge && ge.durationCount > 0
        ? Math.round(ge.totalDuration / ge.durationCount)
        : null;

    // Build team winrates for this map
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
      // Sort by winrate desc, then games played desc
      teamWinrates.sort((a, b) => {
        if (b.winrate !== a.winrate) return b.winrate - a.winrate;
        return b.gamesPlayed - a.gamesPlayed;
      });
    }

    return {
      mapName,
      gamesPlayed,
      totalRounds: ge?.totalRounds ?? 0,
      avgRounds,
      avgDuration,
      overtimes: ge?.overtimes ?? 0,
      tiebreakers: ge?.tiebreakers ?? 0,
      usageRate: 0, // filled later
      timesBanned: ve?.bans ?? 0,
      timesPicked: ve?.picks ?? 0,
      timesDecider: ve?.deciders ?? 0,
      banRate: totalVetoMatches > 0 ? (ve?.bans ?? 0) / totalVetoMatches : 0,
      pickRate: totalVetoMatches > 0 ? (ve?.picks ?? 0) / totalVetoMatches : 0,
      teamWinrates,
    };
  });

  return list;
}

/* -----------------------------------------------------------
 * Tendances par équipe (maps favorites / toujours bannies)
 * ---------------------------------------------------------*/

function computeTeamTendencies(
  vetos: VetoRow[],
  teamNames: Map<string, string>
): TeamMapTendency[] {
  // teamId -> { totalVetos (unique matches), bans: map->count, picks: map->count }
  type TeamAcc = {
    matchIds: Set<string>;
    bans: Map<string, number>;
    picks: Map<string, number>;
  };

  const acc = new Map<string, TeamAcc>();

  for (const v of vetos) {
    if (!v.team_id) continue; // decider has no team
    const ta = acc.get(v.team_id) || {
      matchIds: new Set(),
      bans: new Map(),
      picks: new Map(),
    };
    ta.matchIds.add(v.match_id);
    if (v.action === 'ban') {
      ta.bans.set(v.map_name, (ta.bans.get(v.map_name) || 0) + 1);
    } else if (v.action === 'pick') {
      ta.picks.set(v.map_name, (ta.picks.get(v.map_name) || 0) + 1);
    }
    acc.set(v.team_id, ta);
  }

  const result: TeamMapTendency[] = [];

  acc.forEach((ta, teamId) => {
    const totalVetos = ta.matchIds.size;

    const bans = Array.from(ta.bans.entries())
      .map(([mapName, count]) => ({
        mapName,
        count,
        rate: totalVetos > 0 ? count / totalVetos : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const picks = Array.from(ta.picks.entries())
      .map(([mapName, count]) => ({
        mapName,
        count,
        rate: totalVetos > 0 ? count / totalVetos : 0,
      }))
      .sort((a, b) => b.count - a.count);

    result.push({
      teamId,
      teamName: teamNames.get(teamId) || teamId,
      totalVetos,
      bans,
      picks,
    });
  });

  // Sort by number of veto participations desc
  result.sort((a, b) => b.totalVetos - a.totalVetos);

  return result;
}
