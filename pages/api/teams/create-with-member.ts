import type { NextApiRequest, NextApiResponse } from "next";
import slugify from "slugify";
import { supabaseAdmin } from "@/utils/supabase";

type Body = {
  name?: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  discord?: string | null;
  website?: string | null;
  member_email?: string | null;
  member_role?: string | null;
  member_user_id?: string | null;
  set_captain?: boolean;
};

type MemberResult = {
  id: string | null;
  user_id: string;
  role: string;
  captain: boolean;
};

type ApiResponse =
  | {
      team: Record<string, any>;
      member?: MemberResult;
      info?: string;
    }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: "Supabase service role not configured" });
  }

  const body: Body = req.body || {};
  const name = (body.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Field 'name' is required" });
  }

  const memberEmail = body.member_email?.trim().toLowerCase() || null;
  const memberUserId = body.member_user_id?.trim() || null;
  const wantsMember = Boolean(memberEmail || memberUserId);

  if (body.set_captain && !wantsMember) {
    return res.status(400).json({ error: "Provide a member to set as captain" });
  }

  let resolvedUserId: string | null = null;

  if (wantsMember) {
    if (memberUserId) {
      resolvedUserId = memberUserId;
    } else if (memberEmail) {
      const { data: usersData, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });

      if (listErr) {
        console.error(
          "[/api/teams/create-with-member] listUsers error:",
          listErr
        );
        return res
          .status(500)
          .json({ error: listErr.message || "Failed to list users" });
      }

      const found = usersData?.users?.find(
        (u) => u.email?.toLowerCase() === memberEmail
      );

      if (!found?.id) {
        return res.status(404).json({ error: "User not found for this email" });
      }

      resolvedUserId = found.id;
    }
  }

  const baseSlug =
    slugify(name, { lower: true, strict: true }) ||
    `team-${Date.now().toString(36)}`;

  const attemptPayload = (slug: string) => ({
    name,
    slug,
    short_name: body.short_name?.toString().trim() || null,
    logo_url: body.logo_url?.toString().trim() || null,
    country: body.country?.toString().trim() || null,
    description: body.description?.toString().trim() || null,
    discord: body.discord?.toString().trim() || null,
    website: body.website?.toString().trim() || null,
    is_active: true,
  });

  const maxAttempts = 3;
  let createdTeam: Record<string, any> | null = null;
  let lastError: any = null;

  for (let i = 0; i < maxAttempts; i++) {
    const suffix =
      i === 0
        ? ""
        : `-${Math.random().toString(36).slice(2, 6).toLowerCase()}`;

    const slug = `${baseSlug}${suffix}`;
    const payload = attemptPayload(slug);

    const { data, error } = await supabaseAdmin
      .from("teams")
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      createdTeam = data;
      break;
    }

    lastError = error;
    const message = error?.message?.toLowerCase() || "";
    const isDuplicate =
      message.includes("duplicate") || message.includes("unique");

    if (!isDuplicate) {
      break;
    }
  }

  if (!createdTeam) {
    console.error("[/api/teams/create-with-member] create error:", lastError);
    return res.status(500).json({
      error:
        lastError?.message ||
        "Failed to create team. Try again with another name/slug.",
    });
  }

  let memberResult: MemberResult | undefined;

  if (resolvedUserId) {
    const role = body.member_role?.trim() || "player";
    const memberPayload = {
      team_id: createdTeam.id,
      user_id: resolvedUserId,
      role,
    };

    const { data: member, error: insertErr } = await supabaseAdmin
      .from("team_members")
      .insert(memberPayload)
      .select("id")
      .maybeSingle();

    if (insertErr) {
      console.error(
        "[/api/teams/create-with-member] add-member error:",
        insertErr
      );
      await supabaseAdmin.from("teams").delete().eq("id", createdTeam.id);

      const msg = insertErr.message?.toLowerCase() || "";
      const isDuplicate =
        msg.includes("duplicate") || msg.includes("unique");

      return res.status(400).json({
        error: isDuplicate
          ? "User already belongs to this team"
          : "Member could not be added. The team was not saved.",
      });
    }

    let captain = false;

    if (body.set_captain) {
      const { error: captainErr } = await supabaseAdmin
        .from("teams")
        .update({ captain_id: resolvedUserId })
        .eq("id", createdTeam.id);

      if (captainErr) {
        console.error(
          "[/api/teams/create-with-member] captain update error:",
          captainErr
        );
        return res.status(500).json({
          error:
            captainErr.message ||
            "Member added but failed to set as captain (check teams.captain_id)",
        });
      }

      captain = true;
    }

    memberResult = {
      id: member?.id ?? null,
      user_id: resolvedUserId,
      role,
      captain,
    };
  }

  return res.status(201).json({
    team: createdTeam,
    member: memberResult,
    info: memberResult
      ? "Team created and member added"
      : "Team created",
  });
}
