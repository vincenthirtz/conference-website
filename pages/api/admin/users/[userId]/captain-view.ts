// pages/api/admin/users/[userId]/captain-view.ts
//
// GET only — read-only snapshot of the team a target user CAPTAINS, for the
// admin "mode vue capitaine" feature. Staff-gated (minRole 'manager'), scoped
// to the STAFF's active tenant (ctx.tenantId) and the TARGET userId.
//
// This is INSPECTION, not impersonation: every captain-side query is re-run
// with the target user's team substituted in, but the staff never acts as the
// captain. The handler mirrors the shapes surfaced by the captain area:
//   - /api/teams/join-requests   → joinRequests (pending join demandes)
//   - /api/player/dashboard      → pendingScrims + nextMatch (reused loaders)
//   - demandes aggregation scoped to the captained team
//
// Team resolution is delegated to the canonical loadManagedTeamSlice() so this
// endpoint can never diverge from the player dashboard / admin/teams/my. If the
// target does NOT captain a team in this tenant, `team` is null + isCaptain is
// false (the client renders an empty "not a captain" state).
//
// Every read is scoped to ctx.tenantId. Each request is audited once via
// logStaffAction('view_captain_data').

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute } from '@/utils/staff';
import { loadManagedTeamSlice } from '@/utils/teams/managedTeamSlice';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import { logStaffAction } from '@/utils/staffLogs';
import {
  loadNextMatch,
  loadPendingScrims,
  EMPTY_NEXT_MATCH,
  type NextMatchSection,
} from '@/pages/api/player/dashboard';

import { logger } from '../../../../../utils/logger';

export type AdminCaptainViewUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: string | null;
  battleTag: string | null;
  createdAt: string | null;
};

export type AdminCaptainViewMember = {
  id: string;
  userId: string | null;
  displayName: string | null;
  battleTag: string | null;
  role: string | null;
  isSubstitute: boolean;
  isCaptain: boolean;
};

export type AdminCaptainViewTeam = {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  isJoinable: boolean;
  openForScrim: boolean;
  captainId: string | null;
  members: AdminCaptainViewMember[];
};

export type AdminCaptainViewJoinRequest = {
  id: string;
  user: { displayName: string | null; battleTag: string | null } | null;
  desiredRole: string | null;
  comment: string | null;
  createdAt: string;
};

export type AdminCaptainViewScrim = {
  id: string;
  /** Best-effort counterparty label (requester display name); team resolution
   *  is deliberately deferred — see loadPendingScrims. Null when unknown. */
  opponent: string | null;
  status: string;
  slots: string[];
  createdAt: string;
};

export type AdminCaptainViewDemande = {
  id: string;
  type: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  processed_at?: string | null;
  comment?: string | null;
  payload?: Record<string, unknown> | null;
  team?: { id: string; name: string } | null;
};

export type AdminCaptainViewPayload = {
  user: AdminCaptainViewUser;
  team: AdminCaptainViewTeam | null;
  isCaptain: boolean;
  isManager: boolean;
  joinRequests: AdminCaptainViewJoinRequest[];
  pendingScrims: AdminCaptainViewScrim[];
  nextMatch: NextMatchSection;
  demandes: AdminCaptainViewDemande[];
};

// uuid v1-v5 shape (Supabase auth issues v4, but stay lenient).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** PostgREST embeds come back as object|array depending on FK cardinality. */
function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* -----------------------------------------------------------
 * Sub-builders — each degrades gracefully (never throws) so a
 * single failing section doesn't take the whole snapshot down.
 * ---------------------------------------------------------*/

/** Pending JOIN demandes toward the captained team (mirrors join-requests GET). */
async function buildJoinRequests(
  teamId: string,
  tenantId: string
): Promise<AdminCaptainViewJoinRequest[]> {
  const { data, error } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .eq('type', 'join')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error(
      '[/api/admin/users/[userId]/captain-view] joinRequests error:',
      error
    );
    return [];
  }

  const rows = (data ?? []) as Record<string, any>[];
  const profiles = await fetchAdminUserProfiles(rows.map((d) => d.user_id));

  const mapped = rows.map((d) => {
    const p = d.user_id ? profiles.get(d.user_id as string) : null;
    const payload = (d.payload as Record<string, unknown> | null) ?? null;
    return {
      id: d.id as string,
      user: p
        ? {
            displayName: p.display_name || p.full_name || null,
            battleTag: p.battle_tag || null,
          }
        : null,
      desiredRole: (payload?.desired_role as string | null) ?? null,
      comment: (d.comment as string | null) ?? null,
      createdAt: d.created_at as string,
    };
  });

  mapped.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  return mapped;
}

/** Pending scrim negotiations awaiting the team, reduced to a minimal shape. */
async function buildPendingScrims(
  teamId: string,
  tenantId: string
): Promise<AdminCaptainViewScrim[]> {
  try {
    const raw = await loadPendingScrims(teamId, tenantId);
    return raw.map((s) => ({
      id: s.id,
      opponent: s.user?.display_name ?? null,
      status: s.status,
      slots: s.scrimNego.slots,
      createdAt: s.created_at,
    }));
  } catch (err) {
    logger.error(
      '[/api/admin/users/[userId]/captain-view] pendingScrims error:',
      err
    );
    return [];
  }
}

/** History of demandes tied to the captained team (join/scrim/transfer/…). */
async function buildDemandes(
  teamId: string,
  tenantId: string
): Promise<AdminCaptainViewDemande[]> {
  const { data, error } = await supabaseAdmin
    .from('demandes')
    .select('*, team:teams!team_id(id, name)')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error(
      '[/api/admin/users/[userId]/captain-view] demandes error:',
      error
    );
    return [];
  }

  const mapped: AdminCaptainViewDemande[] = (
    (data ?? []) as Record<string, any>[]
  ).map((d) => {
    const team = unwrap(d.team) as { id: string; name: string } | null;
    return {
      id: d.id as string,
      type: d.type as string,
      status: d.status as string,
      created_at: d.created_at as string,
      updated_at: (d.updated_at as string | null) ?? null,
      processed_at: (d.processed_at as string | null) ?? null,
      comment: (d.comment as string | null) ?? null,
      payload: (d.payload as Record<string, unknown> | null) ?? null,
      team: team ? { id: team.id, name: team.name } : null,
    };
  });

  // Newest-first — the DB order() is a no-op in the in-memory test mock.
  mapped.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return mapped;
}

export default withStaffRoute(async function handler(req, res, ctx) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-captain-view'
    )
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Validate userId.
  const rawUserId = req.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  if (!userId || typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  // 2. Tenant = the staff's active tenant (NOT the target's resolved tenant).
  const tenantId = ctx.tenantId;

  // 3. Verify the target user exists + pull auth metadata.
  const { data: authData, error: authErr } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const targetUser = authData.user;
  const meta = (targetUser.user_metadata ?? {}) as Record<string, unknown>;

  const userSnapshot: AdminCaptainViewUser = {
    id: targetUser.id,
    email: (targetUser.email as string | null) ?? null,
    displayName:
      (meta.display_name as string | null) ??
      (meta.full_name as string | null) ??
      null,
    avatarUrl: (meta.avatar_url as string | null) ?? null,
    role: (meta.role as string | null) ?? null,
    battleTag: (meta.battle_tag as string | null) ?? null,
    createdAt: (targetUser.created_at as string | null) ?? null,
  };

  // 4. Resolve the captained team via the canonical slice (tenant-scoped).
  const slice = await loadManagedTeamSlice(userId, tenantId);
  const isCaptain = slice.isCaptain;
  const isManager = slice.isManager;

  // Not a captain (or no team) → empty "not a captain" payload.
  if (!isCaptain || !slice.team || !slice.teamId) {
    await audit(ctx, userId, tenantId, userSnapshot.email);
    const emptyPayload: AdminCaptainViewPayload = {
      user: userSnapshot,
      team: null,
      isCaptain,
      isManager,
      joinRequests: [],
      pendingScrims: [],
      nextMatch: EMPTY_NEXT_MATCH,
      demandes: [],
    };
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(emptyPayload);
  }

  const teamId = slice.teamId;

  // 5. Resolve member display names via the batch profile RPC (the slice
  //    carries roster battle_tag/role but not the auth display_name).
  const memberProfiles = await fetchAdminUserProfiles(
    slice.members.map((m) => m.user_id)
  );

  const members: AdminCaptainViewMember[] = slice.members.map((m) => {
    const p = m.user_id ? memberProfiles.get(m.user_id) : null;
    return {
      id: m.id,
      userId: m.user_id,
      displayName: p ? p.display_name || p.full_name || null : null,
      battleTag: m.battle_tag,
      role: m.role,
      isSubstitute: m.is_substitute,
      isCaptain: m.is_captain,
    };
  });

  const team: AdminCaptainViewTeam = {
    id: slice.team.id,
    name: slice.team.name,
    slug: slice.team.slug,
    logoUrl: slice.team.logo_url,
    isJoinable: slice.team.is_joinable,
    openForScrim: slice.team.open_for_scrim,
    captainId: slice.team.captain_id,
    members,
  };

  // 6. Build the managed-team sections in parallel.
  const [joinRequests, pendingScrims, nextMatch, demandes] = await Promise.all([
    buildJoinRequests(teamId, tenantId),
    buildPendingScrims(teamId, tenantId),
    loadNextMatch(teamId, tenantId, slice.members.length),
    buildDemandes(teamId, tenantId),
  ]);

  await audit(ctx, userId, tenantId, userSnapshot.email);

  const payload: AdminCaptainViewPayload = {
    user: userSnapshot,
    team,
    isCaptain,
    isManager,
    joinRequests,
    pendingScrims,
    nextMatch,
    demandes,
  };

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json(payload);
}, 'manager');

/** Audit once per request; never block the response on a logging failure. */
async function audit(
  ctx: { staff: { id: string } },
  userId: string,
  tenantId: string,
  email: string | null
): Promise<void> {
  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'view_captain_data',
      entity_type: 'user',
      entity_id: userId,
      tenant_id: tenantId,
      payload: { email },
    });
  } catch (logErr) {
    logger.error(
      '[/api/admin/users/[userId]/captain-view] audit log failed:',
      logErr
    );
  }
}
