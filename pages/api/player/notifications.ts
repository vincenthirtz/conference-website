// pages/api/player/notifications.ts
// GET — aggregated notification counters for the navbar bell.
//
// Returns:
//   - unreadMessages       : number of unread inter-captain messages
//   - pendingScrims        : open scrim requests received by the captain's team
//   - pendingJoinRequests  : open team-join requests received by the captain
//   - pendingInvites       : team invitations addressed TO this user that are
//                             still pending (the rank-and-file invitee view —
//                             un-scoped to any managed team, distinct from the
//                             captain-scoped counters above)
//   - checkinPending       : 1 when the next match has an open check-in window
//                             that hasn't been validated yet, 0 otherwise
//   - total                : sum of the above (for the bell badge)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { resolveMembership } from '@/utils/teams/memberships';
import { listPendingInvitationsForUser } from '@/utils/teams/invitations';
import { getStaffRole } from '@/utils/staff';

export type PlayerNotificationsPayload = {
  hasTeam: boolean;
  /** True when the user is the team captain OR a team manager. */
  isCaptain: boolean;
  isManager: boolean;
  /**
   * Id of the team the user can manage (captain or manager). Exposed so client
   * realtime subscriptions can filter by it (`demandes.team_id=eq.<id>`)
   * without an extra round-trip.
   */
  captainTeamId: string | null;
  /** The user's membership team id (== captainTeamId when manager/captain). */
  memberTeamId: string | null;
  unreadMessages: number;
  pendingScrims: number;
  pendingJoinRequests: number;
  /** Pending team invitations addressed to this user (invitee view). */
  pendingInvites: number;
  checkinPending: 0 | 1;
  /** Open scrim-planning grids awaiting this user's availability input. */
  pendingPlannings: number;
  total: number;
};

async function countMembership(
  userId: string,
  tenantId: string,
  teamId: string | null
) {
  try {
    // Un manager peut appartenir à plusieurs équipes : on prend celle que
    // l'écran a désignée, à défaut la sienne.
    const membership = await resolveMembership(userId, tenantId, teamId);
    return membership?.team_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Invitee-side counter: pending invitations addressed TO this user.
 *
 * Same source as the list the bell links to (`GET /api/player/invitations`),
 * expiry filter included: an expired invitation stays `pending` in the table
 * until the cleanup cron touches it, so counting raw rows made the badge point
 * at a page that rendered nothing.
 */
async function countPendingInvites(
  userId: string,
  tenantId: string
): Promise<number> {
  try {
    const result = await listPendingInvitationsForUser(tenantId, userId);
    return result.ok ? result.data.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Captain inbox counters. Messages, scrims and joins all live in the `demandes`
 * table with the same team/tenant/status filter and differ only on `type`, so a
 * single round-trip fetches the three pending types and we bucket by type in JS
 * (was 3 separate `count` queries).
 *
 *   captain_message + status=pending → unread inbox item
 *   scrim           + status=pending → scrim invite to answer
 *   join            + status=pending → roster candidate to validate
 */
async function countInboxByType(
  teamId: string,
  tenantId: string
): Promise<{
  unreadMessages: number;
  pendingScrims: number;
  pendingJoinRequests: number;
}> {
  const zero = { unreadMessages: 0, pendingScrims: 0, pendingJoinRequests: 0 };
  try {
    const { data } = await supabaseAdmin!
      .from('demandes')
      .select('type')
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId)
      .in('type', ['captain_message', 'scrim', 'join'])
      .eq('status', 'pending');
    let unreadMessages = 0;
    let pendingScrims = 0;
    let pendingJoinRequests = 0;
    for (const row of (data ?? []) as Array<{ type?: string }>) {
      if (row.type === 'captain_message') unreadMessages += 1;
      else if (row.type === 'scrim') pendingScrims += 1;
      else if (row.type === 'join') pendingJoinRequests += 1;
    }
    return { unreadMessages, pendingScrims, pendingJoinRequests };
  } catch {
    return zero;
  }
}

/** Check-in pending = next match within CHECKIN_OPEN_MINUTES + not redeemed. */
async function computeCheckinPending(
  memberTeamId: string,
  tenantId: string
): Promise<0 | 1> {
  try {
    const now = Date.now();
    const cutoffISO = new Date(
      now - CHECKIN_OPEN_MINUTES * 60_000
    ).toISOString();

    const { data: nextMatch } = await supabaseAdmin!
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
      if (isOpen && !checkedInAt) return 1;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Open scrim-planning grids awaiting my availability : je suis participant
 * (capitaine/manager d'une des 2 équipes OU staff) et je n'ai pas encore peint
 * de créneau. Le staff peut peindre sur n'importe quelle grille ouverte du
 * tenant ; un capitaine/manager uniquement sur celles de son équipe.
 */
async function countPendingPlannings(
  userId: string,
  tenantId: string,
  managedTeamId: string | null,
  staffRole: unknown
): Promise<number> {
  try {
    if (!managedTeamId && !staffRole) return 0;
    let query = supabaseAdmin!
      .from('scrim_plannings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .is('deleted_at', null);
    // Non-staff : restreint aux grilles impliquant mon équipe managée.
    if (!staffRole && managedTeamId) {
      query = query.or(
        `team1_id.eq.${managedTeamId},team2_id.eq.${managedTeamId}`
      );
    }
    const { data: openPlannings } = await query;
    const ids = (openPlannings ?? []).map((p) => p.id as string);
    if (ids.length === 0) return 0;
    const { data: mine } = await supabaseAdmin!
      .from('scrim_planning_availabilities')
      .select('planning_id, slots')
      .eq('user_id', userId)
      .in('planning_id', ids);
    const painted = new Set(
      (mine ?? [])
        .filter(
          (r) => Array.isArray(r.slots) && (r.slots as unknown[]).length > 0
        )
        .map((r) => r.planning_id as string)
    );
    return ids.filter((id) => !painted.has(id)).length;
  } catch {
    return 0;
  }
}

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerNotificationsPayload | { error: string }>,
  { subject }
) {
  if (
    applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'player-notifs')
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, tenantId } = subject;

  // Phase 1 — resolve everything the downstream blocks need to know WHICH team
  // / privileges apply. These three are mutually independent (all keyed on the
  // user) so they run in parallel; membership always runs and is only consulted
  // when the user manages no team.
  const [access, staffRole, membershipTeamId] = await Promise.all([
    getManagedTeamForRequest(req, userId, tenantId),
    getStaffRole(userId),
    countMembership(userId, tenantId, readRequestedTeamId(req)),
  ]);

  const managedTeamId = access?.teamId ?? null;
  const memberTeamId = managedTeamId ?? membershipTeamId;
  const hasTeam = !!memberTeamId;
  const isCaptain = !!access?.isCaptain;
  const isManager = !!access?.isManager;
  const canManageInbox = !!access; // captain ou manager

  // Phase 2 — every counter block is now independent and runs in parallel.
  // Each helper degrades to its zero value on failure so one failing block
  // never takes the whole response down.
  const [pendingInvites, inbox, checkinPending, pendingPlannings] =
    await Promise.all([
      countPendingInvites(userId, tenantId),
      canManageInbox && managedTeamId
        ? countInboxByType(managedTeamId, tenantId)
        : Promise.resolve({
            unreadMessages: 0,
            pendingScrims: 0,
            pendingJoinRequests: 0,
          }),
      hasTeam && memberTeamId
        ? computeCheckinPending(memberTeamId, tenantId)
        : Promise.resolve(0 as 0 | 1),
      countPendingPlannings(userId, tenantId, managedTeamId, staffRole),
    ]);

  const { unreadMessages, pendingScrims, pendingJoinRequests } = inbox;

  const total =
    unreadMessages +
    pendingScrims +
    pendingJoinRequests +
    pendingInvites +
    checkinPending +
    pendingPlannings;

  res.setHeader('Cache-Control', 'private, max-age=10');
  return res.status(200).json({
    hasTeam,
    isCaptain,
    isManager,
    captainTeamId: managedTeamId,
    memberTeamId: memberTeamId ?? null,
    unreadMessages,
    pendingScrims,
    pendingJoinRequests,
    pendingInvites,
    checkinPending,
    pendingPlannings,
    total,
  });
});
