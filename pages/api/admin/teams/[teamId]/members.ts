// @ts-nocheck
// pages/api/admin/teams/[teamId]/members.ts
// Liste les membres d'une équipe (admin)

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/utils/supabase";
import { withStaffRoute } from "@/utils/staff";

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type MembersResponse =
  | {
      members: TeamMemberRow[];
      total: number | null;
    }
  | { error: string };

export default withStaffRoute(handler, "manager");

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MembersResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: "Supabase service role not configured" });
  }

  const { teamId } = req.query;
  if (!teamId || Array.isArray(teamId)) {
    return res.status(400).json({ error: "Invalid teamId" });
  }

  const { data, error, count } = await supabaseAdmin
    .from("team_members")
    .select("id, team_id, user_id, role, created_at", {
      count: "exact",
    })
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("admin GET team members error:", error);
    return res.status(500).json({ error: "Failed to fetch team members" });
  }

  return res.status(200).json({
    members: (data || []) as TeamMemberRow[],
    total: typeof count === "number" ? count : null,
  });
}
