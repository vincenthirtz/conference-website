// @ts-nocheck
// pages/api/admin/teams/index.ts
// Admin: liste des équipes avec filtres simples

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/utils/supabase";
import { withStaffRoute } from "@/utils/staff";

export type TeamRow = {
  id: string;
  name: string;
  [key: string]: any;
};

type TeamsApiResponse =
  | {
      teams: TeamRow[];
      total: number | null;
    }
  | { error: string };

// Rôle minimum : manager (vision globale sur les équipes)
export default withStaffRoute(handler, "manager");

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamsApiResponse>
) {
  try {
    switch (req.method) {
      case "GET":
        return await handleGet(req, res);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err: any) {
    console.error("[/api/admin/teams] internal error:", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<TeamsApiResponse>
) {
  const { search, isActive, limit, offset, includeTotal } = req.query;

  const limitNum = parseInt(
    (Array.isArray(limit) ? limit[0] : limit) ?? "50",
    10
  );
  const offsetNum = parseInt(
    (Array.isArray(offset) ? offset[0] : offset) ?? "0",
    10
  );

  const activeFilter =
    isActive === "true"
      ? true
      : isActive === "false"
      ? false
      : undefined;

  let query = supabaseAdmin
    .from("teams")
    .select("*", {
      count:
        includeTotal === "1" || includeTotal === "true"
          ? "exact"
          : "none",
    })
    .order("created_at", { ascending: false })
    .range(offsetNum, offsetNum + limitNum - 1);

  if (typeof activeFilter === "boolean") {
    query = query.eq("is_active", activeFilter);
  }

  if (search && !Array.isArray(search)) {
    const s = `%${search}%`;
    query = query.ilike("name", s);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("admin GET teams error:", error);
    return res.status(500).json({
      error: "Failed to fetch teams",
    });
  }

  return res.status(200).json({
    teams: (data || []) as TeamRow[],
    total: typeof count === "number" ? count : null,
  });
}
