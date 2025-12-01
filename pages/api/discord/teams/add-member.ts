import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/utils/supabase";

type Body = {
  team_id?: string;
  user_id?: string;
  email?: string;
  role?: string;
  set_captain?: boolean;
};

type ApiResponse =
  | {
      teamMemberId?: string;
      teamId: string;
      userId: string;
      role: string;
      captainSet: boolean;
      info?: string;
    }
  | { error: string };

const DISCORD_TEAM_SECRET = process.env.DISCORD_TEAM_SECRET;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!DISCORD_TEAM_SECRET) {
    return res
      .status(500)
      .json({ error: "Discord shared secret not configured" });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: "Supabase service role not configured" });
  }

  const token = extractToken(req);
  if (token !== DISCORD_TEAM_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body: Body = req.body || {};
  const teamId = body.team_id?.trim();
  const role = body.role?.trim() || "player";
  const setCaptain = Boolean(body.set_captain);

  if (!teamId) {
    return res.status(400).json({ error: "Field 'team_id' is required" });
  }

  let resolvedUserId = body.user_id?.trim() || "";

  try {
    // Verify team exists
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr || !team) {
      return res.status(404).json({ error: "Team not found" });
    }

    // Resolve user by email if no user_id provided
    if (!resolvedUserId) {
      const email = body.email?.trim();
      if (!email) {
        return res.status(400).json({
          error: "Provide either 'user_id' or 'email' to find the user",
        });
      }

      const emailLower = email.toLowerCase();
      const { data: usersData, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });

      if (listErr) {
        console.error("[/api/discord/teams/add-member] listUsers error:", listErr);
        return res
          .status(500)
          .json({ error: listErr.message || "Failed to list users" });
      }

      const found = usersData?.users?.find(
        (u) => u.email?.toLowerCase() === emailLower
      );

      if (!found?.id) {
        return res.status(404).json({ error: "User not found for this email" });
      }

      resolvedUserId = found.id;
    }

    // Insert into team_members
    const memberPayload = {
      team_id: teamId,
      user_id: resolvedUserId,
      role,
    };

    const { data: member, error: insertErr } = await supabaseAdmin
      .from("team_members")
      .insert(memberPayload)
      .select("id")
      .maybeSingle();

    if (insertErr) {
      const msg =
        insertErr.message?.includes("duplicate") ||
        insertErr.message?.includes("unique")
          ? "User already in this team"
          : "Failed to add member";
      return res.status(400).json({ error: msg });
    }

    let captainSet = false;

    if (setCaptain) {
      const { error: captainErr } = await supabaseAdmin
        .from("teams")
        .update({ captain_id: resolvedUserId })
        .eq("id", teamId);

      if (captainErr) {
        console.error(
          "[/api/discord/teams/add-member] captain update error:",
          captainErr
        );
        return res.status(500).json({
          error:
            captainErr.message ||
            "Member added but failed to set as captain (check teams.captain_id column)",
        });
      }

      captainSet = true;
    }

    return res.status(200).json({
      teamMemberId: member?.id,
      teamId,
      userId: resolvedUserId,
      role,
      captainSet,
      info: captainSet ? "Member added and set as captain" : "Member added to team",
    });
  } catch (err: any) {
    console.error("[/api/discord/teams/add-member] error:", err);
    return res.status(500).json({
      error: err?.message || "Internal server error",
    });
  }
}

function extractToken(req: NextApiRequest) {
  const auth = req.headers.authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  if (!raw) return null;
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim();
}
