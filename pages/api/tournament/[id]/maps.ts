// @ts-nocheck
// pages/api/tournament/[id]/maps.ts
// Gestion des maps d'un tournoi (pool de maps / ordre / activation)

// ⚠️ Route staff : protégée par withStaffRoute (min: manager)

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/utils/supabase";
import { withStaffRoute } from "@/utils/staff";
import { logStaffAction } from "@/utils/staffLogs";

export type TournamentMapRow = {
  id: string;
  tournament_id: string;
  map_name: string;
  map_slug: string | null;
  map_type: string | null; // ex: "control", "hybrid", ...
  enabled: boolean;
  order_index: number | null;
  created_at: string;
};

export type TournamentMapInput = {
  id?: string;
  map_name: string;
  map_slug?: string | null;
  map_type?: string | null;
  enabled?: boolean;
  order_index?: number | null;
};

// Rôle minimum : manager (peut gérer les settings du tournoi)
export default withStaffRoute(handler, "manager");

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "Invalid tournament id" });
  }

  try {
    switch (req.method) {
      case "GET":
        return await handleGet(id, res);
      case "POST":
        return await handlePost(id, req, res, ctx);
      case "PUT":
      case "PATCH":
        return await handlePut(id, req, res, ctx);
      case "DELETE":
        return await handleDelete(id, req, res, ctx);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err: any) {
    console.error(
      "[/api/tournament/[id]/maps] error:",
      err
    );
    return res.status(500).json({
      error: "Internal server error",
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des maps du tournoi
 * ---------------------------------------------------------*/

async function handleGet(
  tournamentId: string,
  res: NextApiResponse
) {
  const { data, error } = await supabaseAdmin
    .from("tournament_maps")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("order_index", { ascending: true })
    .order("map_name", { ascending: true });

  if (error) {
    console.error("GET tournament_maps error:", error);
    return res.status(500).json({
      error: "Failed to fetch tournament maps",
    });
  }

  return res.status(200).json({
    maps: (data || []) as TournamentMapRow[],
  });
}

/* -----------------------------------------------------------
 * POST : créer / ajouter une map pour le tournoi
 * body: TournamentMapInput (sans tournament_id)
 * ---------------------------------------------------------*/

async function handlePost(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const body = req.body as TournamentMapInput;

  if (!body || !body.map_name) {
    return res.status(400).json({
      error: "map_name is required",
    });
  }

  // on calcule un order_index par défaut à la suite de ce qui existe
  let nextIndex: number | null = null;
  const { data: existing, error: countErr } = await supabaseAdmin
    .from("tournament_maps")
    .select("order_index")
    .eq("tournament_id", tournamentId);

  if (!countErr && existing) {
    const max = (existing as any[])
      .map((m) => m.order_index ?? 0)
      .reduce((acc, v) => Math.max(acc, v), -1);
    nextIndex = max + 1;
  }

  const payload = {
    tournament_id: tournamentId,
    map_name: body.map_name,
    map_slug: body.map_slug ?? null,
    map_type: body.map_type ?? null,
    enabled: body.enabled ?? true,
    order_index:
      typeof body.order_index === "number"
        ? body.order_index
        : nextIndex,
  };

  const { data, error } = await supabaseAdmin
    .from("tournament_maps")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("POST tournament_maps error:", error);
    return res.status(500).json({
      error: "Failed to create tournament map",
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: "update_tournament",
      entity_type: "tournament_map",
      entity_id: (data as any).id,
      tournament_id: tournamentId,
      payload: {
        created: true,
        map_name: body.map_name,
      },
    });
  }

  return res.status(201).json({ map: data as TournamentMapRow });
}

/* -----------------------------------------------------------
 * PUT/PATCH : remplacer la liste des maps du tournoi
 * body: { maps: TournamentMapInput[] }
 * ---------------------------------------------------------*/

async function handlePut(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { maps } = req.body as {
    maps: TournamentMapInput[];
  };

  if (!Array.isArray(maps)) {
    return res.status(400).json({
      error: "Body must include an array 'maps'",
    });
  }

  // 1) On supprime toutes les maps existantes du tournoi
  const { error: delErr } = await supabaseAdmin
    .from("tournament_maps")
    .delete()
    .eq("tournament_id", tournamentId);

  if (delErr) {
    console.error(
      "DELETE existing tournament_maps error:",
      delErr
    );
    return res.status(500).json({
      error: "Failed to clear tournament maps",
    });
  }

  // 2) On insère les nouvelles maps
  const payload = maps.map((m, idx) => ({
    tournament_id: tournamentId,
    map_name: m.map_name,
    map_slug: m.map_slug ?? null,
    map_type: m.map_type ?? null,
    enabled: m.enabled ?? true,
    order_index:
      typeof m.order_index === "number"
        ? m.order_index
        : idx,
  }));

  let insertedMaps: TournamentMapRow[] = [];

  if (payload.length > 0) {
    const { data, error: insErr } = await supabaseAdmin
      .from("tournament_maps")
      .insert(payload)
      .select("*");

    if (insErr) {
      console.error(
        "INSERT tournament_maps error:",
        insErr
      );
      return res.status(500).json({
        error: "Failed to insert tournament maps",
      });
    }

    insertedMaps = (data || []) as TournamentMapRow[];
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: "update_tournament",
      entity_type: "tournament_map",
      entity_id: null,
      tournament_id: tournamentId,
      payload: {
        replaced_all_maps: true,
        maps_count: insertedMaps.length,
      },
    });
  }

  return res.status(200).json({
    maps: insertedMaps,
  });
}

/* -----------------------------------------------------------
 * DELETE : supprimer une map (ou toutes)
 * - query.mapId = id spécifique
 * - sinon : supprime toutes les maps du tournoi
 * ---------------------------------------------------------*/

async function handleDelete(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { mapId } = req.query;

  if (mapId && Array.isArray(mapId)) {
    return res.status(400).json({
      error: "Invalid mapId",
    });
  }

  let query = supabaseAdmin
    .from("tournament_maps")
    .delete()
    .eq("tournament_id", tournamentId);

  if (mapId) {
    query = query.eq("id", mapId);
  }

  const { error } = await query;

  if (error) {
    console.error("DELETE tournament_map(s) error:", error);
    return res.status(500).json({
      error: "Failed to delete tournament maps",
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: "update_tournament",
      entity_type: "tournament_map",
      entity_id: mapId ? String(mapId) : null,
      tournament_id: tournamentId,
      payload: {
        deleted_all: !mapId,
        deleted_one: !!mapId,
      },
    });
  }

  return res.status(200).json({ success: true });
}
