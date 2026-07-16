// pages/api/admin/users/[userId]/player-view.ts
//
// GET only — read-only snapshot of a target user's PLAYER area, for the admin
// "mode vue player" feature. Staff-gated (minRole 'admin'), scoped to the
// STAFF's active tenant (ctx.tenantId) and the TARGET userId.
//
// This is INSPECTION, not impersonation: every player-side query is re-run with
// the target user's id substituted in, but the staff never acts as the user.
// The handler reproduces the exact shapes returned by:
//   - /api/player/matches      → matches: PlayerMatch[]
//   - /api/player/notifications → notifications counters
//   - /api/admin/teams/my       → team + members
//   - /api/demandes/{captain,join} → demandes aggregation
//
// Every read is scoped to ctx.tenantId (the staff's active tenant) — NOT
// resolveTenantIdForUserRequest on the target. Each request is audited once via
// logStaffAction('view_player_data').

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute } from '@/utils/staff';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import { logStaffAction } from '@/utils/staffLogs';
import type { PlayerMatch } from '@/pages/api/player/matches';

import { logger } from '../../../../../utils/logger';

export type AdminPlayerViewUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  battleTag: string | null;
  avatarUrl: string | null;
  role: string | null;
  createdAt: string | null;
};

export type AdminPlayerViewTeamMember = {
  id: string;
  displayName: string | null;
  battleTag: string | null;
  role: string | null;
  isSubstitute: boolean;
};

export type AdminPlayerViewTeam = {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  role: 'captain' | 'member' | null;
  isSubstitute: boolean;
  members: AdminPlayerViewTeamMember[];
};

export type AdminPlayerViewNotifications = {
  hasTeam: boolean;
  isCaptain: boolean;
  isManager: boolean;
  unreadMessages: number;
  pendingScrims: number;
  pendingJoinRequests: number;
  checkinPending: 0 | 1;
  total: number;
};

export type AdminPlayerViewDemande = {
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

export type AdminPlayerViewPayload = {
  user: AdminPlayerViewUser;
  team: AdminPlayerViewTeam | null;
  matches: PlayerMatch[];
  notifications: AdminPlayerViewNotifications;
  demandes: AdminPlayerViewDemande[];
};

type TeamRef = { id: string; name: string } | null;

/** PostgREST embeds come back as object|array depending on FK cardinality. */
function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// uuid v1-v5 shape (Supabase auth issues v4, but stay lenient).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* -----------------------------------------------------------
 * Sub-builders — each mirrors a player-side endpoint, with the
 * target userId + the staff tenant substituted in.
 * ---------------------------------------------------------*/

async function buildTeam(
  userId: string,
  tenantId: string
): Promise<{ team: AdminPlayerViewTeam | null; teamId: string | null }> {
  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const teamId = (membership?.team_id as string | undefined) ?? null;
  if (!teamId) return { team: null, teamId: null };

  const { data: teamRow } = await supabaseAdmin
    .from('teams')
    .select('id, name, slug, logo_url, captain_id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!teamRow) return { team: null, teamId: null };

  const captainId = (teamRow.captain_id as string | null) ?? null;

  const { data: membersRaw } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id, role, battle_tag, is_substitute, display_name')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  const members: AdminPlayerViewTeamMember[] = (membersRaw ?? []).map(
    (m: Record<string, unknown>) => ({
      id: m.id as string,
      displayName: (m.display_name as string | null) ?? null,
      battleTag: (m.battle_tag as string | null) ?? null,
      role: (m.role as string | null) ?? null,
      isSubstitute: !!m.is_substitute,
    })
  );

  // The target's own membership row → captain flag + substitute flag.
  const ownMember = (membersRaw ?? []).find(
    (m: Record<string, unknown>) => m.user_id === userId
  );
  const role: 'captain' | 'member' | null = ownMember
    ? captainId === userId
      ? 'captain'
      : 'member'
    : null;
  const isSubstitute = ownMember ? !!ownMember.is_substitute : false;

  return {
    team: {
      id: teamRow.id as string,
      name: teamRow.name as string,
      slug: (teamRow.slug as string | null) ?? null,
      logoUrl: (teamRow.logo_url as string | null) ?? null,
      role,
      isSubstitute,
      members,
    },
    teamId,
  };
}

async function buildMatches(
  teamId: string | null,
  tenantId: string
): Promise<PlayerMatch[]> {
  if (!teamId) return [];

  const { data: rows, error } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, scheduled_at, match_format, round_name, stream_url,
      team1_id, team2_id,
      team1_score, team2_score, winner_team_id,
      team1_checkin_token, team2_checkin_token,
      team1_checked_in_at, team2_checked_in_at,
      team1:team1_id(id, name),
      team2:team2_id(id, name),
      tournament:tournament_id(id, name, slug)
      `
    )
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .eq('tenant_id', tenantId)
    .order('scheduled_at', { ascending: false })
    .limit(100);

  if (error) {
    logger.error(
      '[/api/admin/users/[userId]/player-view] matches error:',
      error
    );
    return [];
  }

  const now = Date.now();

  return (rows ?? []).map((match: Record<string, any>) => {
    const isTeam1 = match.team1_id === teamId;
    const slot: 1 | 2 = isTeam1 ? 1 : 2;

    const t1 = unwrap(match.team1) as TeamRef;
    const t2 = unwrap(match.team2) as TeamRef;
    const opponentRef = isTeam1 ? t2 : t1;

    const tournament = unwrap(match.tournament) as {
      id: string;
      name: string;
      slug: string | null;
    } | null;

    const team1Score = (match.team1_score as number | null) ?? null;
    const team2Score = (match.team2_score as number | null) ?? null;
    const myScore = isTeam1 ? team1Score : team2Score;
    const oppScore = isTeam1 ? team2Score : team1Score;
    const score =
      myScore === null && oppScore === null
        ? null
        : { mine: myScore, opponent: oppScore };

    const winnerTeamId = (match.winner_team_id as string | null) ?? null;
    const status = match.status as string;
    let result: 'win' | 'loss' | 'draw' | null = null;
    if (winnerTeamId) {
      result = winnerTeamId === teamId ? 'win' : 'loss';
    } else if (
      status === 'completed' &&
      myScore !== null &&
      oppScore !== null &&
      myScore === oppScore
    ) {
      result = 'draw';
    }

    const scheduledAt = (match.scheduled_at as string | null) ?? null;
    let checkin: PlayerMatch['checkin'] = null;
    if (status === 'pending' && scheduledAt) {
      const token = isTeam1
        ? (match.team1_checkin_token as string | null)
        : (match.team2_checkin_token as string | null);
      const checkedInAt = isTeam1
        ? match.team1_checked_in_at
        : match.team2_checked_in_at;

      const opensAt = new Date(
        new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
      ).toISOString();
      const closesAt = scheduledAt;
      const isOpen =
        now >= new Date(opensAt).getTime() &&
        now <= new Date(closesAt).getTime();
      const isPassed = now > new Date(closesAt).getTime();

      checkin = {
        token: token ?? null,
        alreadyCheckedIn: !!checkedInAt,
        opensAt,
        closesAt,
        isOpen,
        isPassed,
      };
    }

    const formatStr = (match.match_format as string | null) ?? null;
    const bestOf = formatStr
      ? Number.parseInt(formatStr.replace(/[^\d]/g, ''), 10) || null
      : null;

    return {
      id: match.id as string,
      scheduledAt,
      status,
      roundName: (match.round_name as string | null) ?? null,
      format: formatStr,
      bestOf,
      streamUrl: (match.stream_url as string | null) ?? null,
      slot,
      opponent: opponentRef
        ? { id: opponentRef.id, name: opponentRef.name }
        : null,
      score,
      result,
      tournament,
      checkin,
    };
  });
}

async function buildNotifications(
  userId: string,
  tenantId: string,
  fallbackMemberTeamId: string | null
): Promise<AdminPlayerViewNotifications> {
  const access = await getManagedTeam(userId, tenantId);
  const managedTeamId = access?.teamId ?? null;
  const memberTeamId = managedTeamId ?? fallbackMemberTeamId;
  const hasTeam = !!memberTeamId;
  const isCaptain = !!access?.isCaptain;
  const isManager = !!access?.isManager;
  const canManageInbox = !!access;

  let unreadMessages = 0;
  let pendingScrims = 0;
  let pendingJoinRequests = 0;
  let checkinPending: 0 | 1 = 0;

  if (canManageInbox && managedTeamId) {
    const { count: unread } = await supabaseAdmin
      .from('demandes')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', managedTeamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'captain_message')
      .eq('status', 'pending');
    unreadMessages = unread ?? 0;

    const { count: scrims } = await supabaseAdmin
      .from('demandes')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', managedTeamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('status', 'pending');
    pendingScrims = scrims ?? 0;

    const { count: joins } = await supabaseAdmin
      .from('demandes')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', managedTeamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'join')
      .eq('status', 'pending');
    pendingJoinRequests = joins ?? 0;
  }

  if (hasTeam && memberTeamId) {
    const now = Date.now();
    const cutoffISO = new Date(
      now - CHECKIN_OPEN_MINUTES * 60_000
    ).toISOString();

    const { data: nextMatch } = await supabaseAdmin
      .from('matches')
      .select(
        `id, scheduled_at, status, team1_id, team2_id,
         team1_checked_in_at, team2_checked_in_at`
      )
      .or(`team1_id.eq.${memberTeamId},team2_id.eq.${memberTeamId}`)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'ongoing'])
      .gte('scheduled_at', cutoffISO)
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextMatch?.scheduled_at) {
      const scheduledMs = new Date(nextMatch.scheduled_at).getTime();
      const opensMs = scheduledMs - CHECKIN_OPEN_MINUTES * 60_000;
      const isOpen = now >= opensMs && now <= scheduledMs;
      const isTeam1 = nextMatch.team1_id === memberTeamId;
      const checkedInAt = isTeam1
        ? nextMatch.team1_checked_in_at
        : nextMatch.team2_checked_in_at;
      if (isOpen && !checkedInAt) checkinPending = 1;
    }
  }

  const total =
    unreadMessages + pendingScrims + pendingJoinRequests + checkinPending;

  return {
    hasTeam,
    isCaptain,
    isManager,
    unreadMessages,
    pendingScrims,
    pendingJoinRequests,
    checkinPending,
    total,
  };
}

async function buildDemandes(
  userId: string,
  tenantId: string
): Promise<AdminPlayerViewDemande[]> {
  const { data: rows, error } = await supabaseAdmin
    .from('demandes')
    .select('*, team:teams!team_id(id, name)')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error(
      '[/api/admin/users/[userId]/player-view] demandes error:',
      error
    );
    return [];
  }

  const mapped: AdminPlayerViewDemande[] = (rows ?? []).map(
    (d: Record<string, any>) => {
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
    }
  );

  // Newest-first. The DB order() is a no-op in the in-memory test mock, so sort
  // here too to guarantee the contract regardless of the backend.
  mapped.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return mapped;
}

export default withStaffRoute(async function handler(req, res, ctx) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-player-view')
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

  const userSnapshot: AdminPlayerViewUser = {
    id: targetUser.id,
    email: (targetUser.email as string | null) ?? null,
    displayName:
      (meta.display_name as string | null) ??
      (meta.full_name as string | null) ??
      null,
    battleTag: (meta.battle_tag as string | null) ?? null,
    avatarUrl: (meta.avatar_url as string | null) ?? null,
    role: (meta.role as string | null) ?? null,
    createdAt: (targetUser.created_at as string | null) ?? null,
  };

  // 4. Build the snapshot, all scoped to the staff tenant + target userId.
  const { team, teamId } = await buildTeam(userId, tenantId);
  const [matches, notifications, demandes] = await Promise.all([
    buildMatches(teamId, tenantId),
    buildNotifications(userId, tenantId, teamId),
    buildDemandes(userId, tenantId),
  ]);

  // 5. Audit — once per request, never block the response on a logging failure.
  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'view_player_data',
      entity_type: 'user',
      entity_id: userId,
      tenant_id: tenantId,
      payload: { email: userSnapshot.email },
    });
  } catch (logErr) {
    logger.error(
      '[/api/admin/users/[userId]/player-view] audit log failed:',
      logErr
    );
  }

  const payload: AdminPlayerViewPayload = {
    user: userSnapshot,
    team,
    matches,
    notifications,
    demandes,
  };

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json(payload);
}, 'admin');
