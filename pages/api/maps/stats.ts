// @ts-nocheck
// pages/api/maps/stats.ts
// API publique "Top maps du tournoi"
// - stats par map à partir des games
// - filtré sur un tournoi donné
// - ignore les BYE et les matchs annulés

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/utils/supabase";

/* -----------------------------------------------------------
 * Types
 * ---------------------------------------------------------*/

type MatchStatus = "pending" | "ongoing" | "finished" | "cancelled";

type MatchRow = {
  id: string;
  tournament_id: string;
  status: MatchStatus;
  is_bye: boolean | null;
};

type GameRow = {
  match_id: string;
  map_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

export type MapTopStat = {
  mapName: string;
  gamesPlayed: number;
  // total de rounds (score team1 + score team2)
  totalRounds: number;
  avgRounds: number;
  overtimes: number;
  tiebreakers: number;
  // pourcentage d'utilisation dans le tournoi
  usageRate: number; // 0–1
};

export type MapsStatsApiResponse = {
  tournamentId: string;
  totalGames: number;
  maps: MapTopStat[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ error: "Method not allowed" });
  }

  const { tournamentId, limit, minGames } = req.query;

  if (
    !tournamentId ||
    Array.isArray(tournamentId)
  ) {
    return res.status(400).json({
      error:
        "Query parameter 'tournamentId' is required",
    });
  }

  const limitNum = parseInt(
    (Array.isArray(limit) ? limit[0] : limit) ?? "20",
    10
  );
  const minGamesNum = parseInt(
    (Array.isArray(minGames)
      ? minGames[0]
      : minGames) ?? "1",
    10
  );

  try {
    // 1) Récupérer les matches du tournoi (hors annulés, hors BYE)
    const { data: matchesData, error: mErr } =
      await supabaseAdmin
        .from("matches")
        .select(
          "id, tournament_id, status, is_bye"
        )
        .eq("tournament_id", tournamentId)
        .neq("status", "cancelled");

    if (mErr) {
      console.error(
        "/api/maps/stats matches error:",
        mErr
      );
      return res.status(500).json({
        error: "Failed to fetch matches",
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
        maps: [],
      };
      return res.status(200).json(empty);
    }

    // 2) Récupérer toutes les games pour ces matches
    const { data: gamesData, error: gErr } =
      await supabaseAdmin
        .from("games")
        .select(
          "match_id, map_name, team1_score, team2_score, is_tiebreaker, went_overtime"
        )
        .in("match_id", matchIds);

    if (gErr) {
      console.error(
        "/api/maps/stats games error:",
        gErr
      );
      return res.status(500).json({
        error: "Failed to fetch games",
      });
    }

    const games = (gamesData || []) as GameRow[];

    // 3) Calcul des stats par map
    const stats = computeMapStats(games);
    const totalGames = stats.reduce(
      (sum, m) => sum + m.gamesPlayed,
      0
    );

    // 4) Calcul du taux d'utilisation + filtres
    const withUsage: MapTopStat[] = stats.map((s) => ({
      ...s,
      usageRate:
        totalGames > 0
          ? s.gamesPlayed / totalGames
          : 0,
    }));

    let filtered = withUsage.filter(
      (m) => m.gamesPlayed >= minGamesNum
    );

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

    const response: MapsStatsApiResponse = {
      tournamentId,
      totalGames,
      maps: filtered,
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error(
      "[/api/maps/stats] internal error:",
      err
    );
    return res.status(500).json({
      error: "Internal server error",
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * Calcul des stats globales par map
 * ---------------------------------------------------------*/

function computeMapStats(games: GameRow[]): MapTopStat[] {
  type Agg = {
    games: number;
    totalRounds: number;
    overtimes: number;
    tiebreakers: number;
  };

  const agg = new Map<string, Agg>();

  for (const g of games) {
    if (!g.map_name) continue;

    const key = g.map_name;
    const entry =
      agg.get(key) || {
        games: 0,
        totalRounds: 0,
        overtimes: 0,
        tiebreakers: 0,
      };

    entry.games += 1;

    const s1 = g.team1_score ?? 0;
    const s2 = g.team2_score ?? 0;
    entry.totalRounds += s1 + s2;

    if (g.went_overtime) {
      entry.overtimes += 1;
    }
    if (g.is_tiebreaker) {
      entry.tiebreakers += 1;
    }

    agg.set(key, entry);
  }

  const list: MapTopStat[] = Array.from(agg.entries()).map(
    ([mapName, entry]) => {
      const avgRounds =
        entry.games > 0
          ? entry.totalRounds / entry.games
          : 0;

      return {
        mapName,
        gamesPlayed: entry.games,
        totalRounds: entry.totalRounds,
        avgRounds,
        overtimes: entry.overtimes,
        tiebreakers: entry.tiebreakers,
        usageRate: 0, // rempli plus tard
      };
    }
  );

  return list;
}
