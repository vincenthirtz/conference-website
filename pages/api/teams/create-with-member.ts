import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
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
  members?: MemberInput[];
};

type MemberInput = {
  email?: string | null;
  user_id?: string | null;
  role?: string | null;
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
      members?: MemberResult[];
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

  const rawMembers = Array.isArray(body.members) ? body.members : [];
  const cleanedMembers = rawMembers
    .map((m) => ({
      email: m.email?.toString().trim().toLowerCase() || "",
      user_id: m.user_id?.toString().trim() || "",
      role: m.role?.toString().trim() || "",
      set_captain: Boolean(m.set_captain),
    }))
    .filter((m) => m.email || m.user_id);

  if (cleanedMembers.length > 5) {
    return res.status(400).json({
      error: "You can add up to 5 members in one request",
    });
  }

  const wantsMember = Boolean(memberEmail || memberUserId || cleanedMembers.length);

  if (body.set_captain && !wantsMember) {
    return res.status(400).json({ error: "Provide a member to set as captain" });
  }

  let memberRecords: { user_id: string; role: string; captain: boolean }[] = [];
  let usersEmailMap: Map<string, string> | null = null;
  const ensureUsersEmailMap = async () => {
    if (usersEmailMap) return usersEmailMap;
    usersEmailMap = await listUsersEmailMap();
    return usersEmailMap;
  };

  if (cleanedMembers.length === 0 && wantsMember) {
    // Fallback to single member fields
    const resolvedRole = body.member_role?.trim() || "player";
    if (memberUserId) {
      memberRecords.push({
        user_id: memberUserId,
        role: resolvedRole,
        captain: Boolean(body.set_captain),
      });
    } else if (memberEmail) {
      try {
        const emailMap = await ensureUsersEmailMap();
        const { userId } = await findOrCreateUserByEmail(
          memberEmail,
          resolvedRole,
          emailMap
        );

        memberRecords.push({
          user_id: userId,
          role: resolvedRole,
          captain: Boolean(body.set_captain),
        });
      } catch (err: any) {
        const message =
          err?.message || "User lookup failed for the provided email";
        return res.status(500).json({ error: message });
      }
    }
  } else if (cleanedMembers.length > 0) {
    for (const m of cleanedMembers) {
      const resolvedRole = m.role || "player";

      if (m.user_id) {
        memberRecords.push({
          user_id: m.user_id,
          role: resolvedRole,
          captain: Boolean(m.set_captain),
        });
        continue;
      }

      if (!m.email) continue;

      try {
        const emailMap = await ensureUsersEmailMap();
        const { userId } = await findOrCreateUserByEmail(
          m.email,
          resolvedRole,
          emailMap
        );

        memberRecords.push({
          user_id: userId,
          role: resolvedRole,
          captain: Boolean(m.set_captain),
        });
      } catch (err: any) {
        const message =
          err?.message ||
          "User could not be found or created for one of the provided emails";
        return res.status(500).json({ error: message });
      }
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

  // Ensure only one captain flag across bulk list
  const firstCaptainIdx = memberRecords.findIndex((m) => m.captain);
  const captainUserId = firstCaptainIdx >= 0 ? memberRecords[firstCaptainIdx].user_id : null;
  memberRecords = memberRecords.map((m, idx) => ({
    ...m,
    captain: firstCaptainIdx === idx && m.captain,
  }));

  const insertedMembers: MemberResult[] = [];

  for (const m of memberRecords) {
    const memberPayload = {
      team_id: createdTeam.id,
      user_id: m.user_id,
      role: m.role,
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
      await supabaseAdmin.from("team_members").delete().eq("team_id", createdTeam.id);
      await supabaseAdmin.from("teams").delete().eq("id", createdTeam.id);

      const msg = insertErr.message?.toLowerCase() || "";
      const isDuplicate =
        msg.includes("duplicate") || msg.includes("unique");

      return res.status(400).json({
        error: isDuplicate
          ? "One of the users already belongs to this team"
          : "Member(s) could not be added. The team was not saved.",
      });
    }

    insertedMembers.push({
      id: member?.id ?? null,
      user_id: m.user_id,
      role: m.role,
      captain: m.captain,
    });
  }

  if (captainUserId) {
    const { error: captainErr } = await supabaseAdmin
      .from("teams")
      .update({ captain_id: captainUserId })
      .eq("id", createdTeam.id);

    if (captainErr) {
      console.error(
        "[/api/teams/create-with-member] captain update error:",
        captainErr
      );
      return res.status(500).json({
        error:
          captainErr.message ||
          "Members added but failed to set captain (check teams.captain_id)",
      });
    }
  }

  return res.status(201).json({
    team: createdTeam,
    members: insertedMembers.length ? insertedMembers : undefined,
    info: insertedMembers.length
      ? "Team created and members added (users auto-created if needed)"
      : "Team created",
  });
}

async function listUsersEmailMap() {
  const emailMap = new Map<string, string>();
  const perPage = 1000;
  const maxPages = 5;

  for (let page = 1; page <= maxPages; page++) {
    const { data: usersData, error: listErr } =
      await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

    if (listErr) {
      console.error(
        "[/api/teams/create-with-member] listUsers error:",
        listErr
      );
      throw new Error(listErr.message || "Failed to list users");
    }

    usersData?.users?.forEach((u) => {
      const emailLower = u.email?.toLowerCase();
      if (emailLower) emailMap.set(emailLower, u.id);
    });

    if (!usersData?.users || usersData.users.length < perPage) {
      break;
    }
  }

  return emailMap;
}

async function findOrCreateUserByEmail(
  email: string,
  role: string,
  emailMap: Map<string, string>
): Promise<{ userId: string; created: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Email is required to create a user");
  }

  const existingId = emailMap.get(normalizedEmail);
  if (existingId) {
    return { userId: existingId, created: false };
  }

  const generatedPassword = generatePassword(16);
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: {
      role: role || "player",
    },
  });

  if (error || !data?.user?.id) {
    console.error(
      "[/api/teams/create-with-member] createUser error:",
      error
    );
    throw new Error(error?.message || "Failed to create user");
  }

  emailMap.set(normalizedEmail, data.user.id);

  return {
    userId: data.user.id,
    created: true,
  };
}

function generatePassword(length = 16) {
  const buffer = crypto.randomBytes(length);
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@$%^*";
  return Array.from(buffer)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("")
    .slice(0, length);
}
