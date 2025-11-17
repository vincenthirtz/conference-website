// pages/api/admin/tournament/[id].ts
// Admin: détails d'un tournoi (lecture seule)

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/utils/supabase";
import { withStaffRoute } from "@/utils/staff"; // adapte le chemin si besoin

type TournamentDetail = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  max_teams: number | null;
  created_at: string;
  updated_at: string | null;
};

type ApiResponse =
  | { tournament: TournamentDetail }
  | { error: string };

// Rôle minimum : manager (ou admin, à toi de voir)
export default withStaffRoute(handler, "manager");

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  _ctx: any
) {
  const { id } = req.query;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "Missing tournament id" });
  }

  try {
    const { data, error } = await supabaseAdmin!
      .from("tournaments")
      .select(
        `
        id,
        name,
        slug,
        game,
        status,
        start_date,
        end_date,
        max_teams,
        created_at,
        updated_at
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("admin GET tournament error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch tournament" });
    }

    if (!data) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    return res.status(200).json({ tournament: data as TournamentDetail });
  } catch (err: any) {
    console.error("admin GET tournament internal error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Internal server error" });
  }
}
