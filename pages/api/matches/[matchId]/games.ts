// pages/api/matches/[matchId]/games.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/utils/supabase";
import { withStaffRoute } from "@/utils/staff";
import { applyMatchScore } from "@/utils/matches/applyScore";
import { logStaffAction } from "@/utils/staffLogs";

export default withStaffRoute(handler, "referee");

/* -----------------------------------------------------------
 * Types
 * ---------------------------------------------------------*/

type GameRow = {
  id: string;
  match_id: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
  created_at: string;
};

type GameInput = {
  id?: string;
  map_name?: string | null;
  map_order?: number | null;
  team1_score?: number | null;
  team2_score?: number | null;
  is_tiebreaker?: boolean | null;
  went_overtime?: boolean | null;
};

type RecomputeMode = "none" | "from_games";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId)) {
    return res.status(400).json({ error: "Invalid matchId" });
  }

  try {
    switch (req.method) {
      case "GET":
        return await handleGet(matchId, res);
      case "POST":
        return await handlePost(matchId, req, res, ctx);
      case "PUT":
      case "PATCH":
        return await handlePut(matchId, req, res, ctx);
      case "DELETE":
        return await handleDelete(matchId, res, ctx);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err: any) {
    console.error("[/api/matches/[matchId]/games] error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des games d'un match
 * ---------------------------------------------------------*/

async function handleGet(matchId: string, res: NextApiResponse) {
  const { data, error } = await supabaseAdmin
    .from("games")
    .select("*")
    .eq("match_id", matchId)
    .order("map_order", { ascending: true });

  if (error) {
    console.error("GET games error:", error);
    return res.status(500).json({ error: "Failed to fetch games" });
  }

  return res.status(200).json({
    games: (data || []) as GameRow[],
  });
}

/* -----------------------------------------------------------
 * POST : créer une nouvelle game pour le match
 * body: GameInput (sans id)
 * ---------------------------------------------------------*/

async function handlePost(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const body = req.body as GameInput;

  const payload = {
    match_id: matchId,
    map_name: body.map_name ?? null,
    map_order: body.map_order ?? null,
    team1_score: body.team1_score ?? 0,
    team2_score: body.team2_score ?? 0,
    is_tiebreaker: body.is_tiebreaker ?? false,
    went_overtime: body.went_overtime ?? false,
  };

  const { data, error } = await supabaseAdmin
    .from("games")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("POST game error:", error);
    return res.status(500).json({ error: "Failed to create game" });
  }

  // log staff
  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: "update_match",
      entity_type: "game",
      entity_id: data.id,
      tournament_id: null,
      payload: {
        match_id: matchId,
        created: true,
      },
    });
  }

  return res.status(201).json({ game: data as GameRow });
}

/* -----------------------------------------------------------
 * PUT/PATCH : remplacer la liste des games du match
 * body: { games: GameInput[], recomputeMode?: "none" | "from_games" }
 * ---------------------------------------------------------*/

async function handlePut(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { games, recomputeMode } = req.body as {
    games: GameInput[];
    recomputeMode?: RecomputeMode;
  };

  if (!Array.isArray(games)) {
    return res
      .status(400)
      .json({ error: "Body must include an array 'games'" });
  }

  // 1) On supprime les games existantes du match (remplacement complet)
  const { error: delErr } = await supabaseAdmin
    .from("games")
    .delete()
    .eq("match_id", matchId);

  if (delErr) {
    console.error("DELETE existing games error:", delErr);
    return res.status(500).json({
      error: "Failed to clear existing games",
    });
  }

  // 2) On insère les nouvelles games
  const insertPayload = games.map((g, idx) => ({
    match_id: matchId,
    map_name: g.map_name ?? null,
    map_order:
      typeof g.map_order === "number"
        ? g.map_order
        : idx,
    team1_score: g.team1_score ?? 0,
    team2_score: g.team2_score ?? 0,
    is_tiebreaker: g.is_tiebreaker ?? false,
    went_overtime: g.went_overtime ?? false,
  }));

  let newGames: GameRow[] = [];

  if (insertPayload.length > 0) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("games")
      .insert(insertPayload)
      .select("*");

    if (insErr) {
      console.error("INSERT games error:", insErr);
      return res.status(500).json({
        error: "Failed to insert games",
      });
    }

    newGames = (inserted || []) as GameRow[];
  }

  // 3) Optionnel : recalcul du score du match à partir des games
  let recomputeResult: any = null;

  if (recomputeMode === "from_games") {
    const total = computeTotalsFromGames(newGames);
    try {
      recomputeResult = await applyMatchScore({
        matchId,
        team1Score: total.team1,
        team2Score: total.team2,
        // winnerTeamId déduit automatiquement si possible
        markFinished: true,
        propagateBracket: true,
        staffId: ctx.staff?.id ?? null,
      });
    } catch (e) {
      console.error(
        "Recompute match from games error:",
        e
      );
      // On ne bloque pas forcément pour ça, les games sont quand même sauvegardées
    }
  }

  // 4) Log staff
  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: "update_match",
      entity_type: "game",
      entity_id: null,
      tournament_id: null,
      payload: {
        match_id: matchId,
        replaced_all_games: true,
        games_count: newGames.length,
        recompute_mode: recomputeMode ?? "none",
      },
    });
  }

  return res.status(200).json({
    games: newGames,
    matchRecomputed: recomputeResult,
  });
}

/* -----------------------------------------------------------
 * DELETE : supprimer toutes les games du match
 * ---------------------------------------------------------*/

async function handleDelete(
  matchId: string,
  res: NextApiResponse,
  ctx: any
) {
  const { error } = await supabaseAdmin
    .from("games")
    .delete()
    .eq("match_id", matchId);

  if (error) {
    console.error("DELETE games error:", error);
    return res.status(500).json({
      error: "Failed to delete games",
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: "update_match",
      entity_type: "game",
      entity_id: null,
      tournament_id: null,
      payload: {
        match_id: matchId,
        deleted_all_games: true,
      },
    });
  }

  return res.status(200).json({ success: true });
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function computeTotalsFromGames(games: GameRow[]): {
  team1: number;
  team2: number;
} {
  let t1 = 0;
  let t2 = 0;

  for (const g of games) {
    t1 += g.team1_score ?? 0;
    t2 += g.team2_score ?? 0;
  }

  return { team1: t1, team2: t2 };
}
