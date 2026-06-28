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
import { withAuthRoute } from '@/utils/staff';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';

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
  total: number;
};

async function countMembership(userId: string, tenantId: string) {
  const { data } = await supabaseAdmin!
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data?.team_id ?? null;
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerNotificationsPayload | { error: string }>,
  { user }
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

  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: user.id });
  const access = await getManagedTeam(user.id, tenantId);
  const managedTeamId = access?.teamId ?? null;
  const memberTeamId =
    managedTeamId ?? (await countMembership(user.id, tenantId));
  const hasTeam = !!memberTeamId;
  const isCaptain = !!access?.isCaptain;
  const isManager = !!access?.isManager;
  const canManageInbox = !!access; // captain ou manager

  let unreadMessages = 0;
  let pendingScrims = 0;
  let pendingJoinRequests = 0;
  let checkinPending: 0 | 1 = 0;

  // Invitee-side counter: invitations addressed TO this user that are still
  // pending. Un-scoped to a managed team — every authenticated user can be an
  // invitee regardless of captain/manager status.
  const { count: invites } = await supabaseAdmin!
    .from('demandes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('type', 'invite')
    .eq('status', 'pending');
  const pendingInvites = invites ?? 0;

  if (canManageInbox && managedTeamId) {
    // All inbound demandes targeting this team. Messages, scrims and joins
    // share the `demandes` table; we discriminate on `type`.
    //
    //   captain_message + status=pending → unread inbox item
    //   scrim           + status=pending → scrim invite to answer
    //   join            + status=pending → roster candidate to validate
    const { count: unread } = await supabaseAdmin!
      .from('demandes')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', managedTeamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'captain_message')
      .eq('status', 'pending');
    unreadMessages = unread ?? 0;

    const { count: scrims } = await supabaseAdmin!
      .from('demandes')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', managedTeamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('status', 'pending');
    pendingScrims = scrims ?? 0;

    const { count: joins } = await supabaseAdmin!
      .from('demandes')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', managedTeamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'join')
      .eq('status', 'pending');
    pendingJoinRequests = joins ?? 0;
  }

  // Check-in pending = next match within CHECKIN_OPEN_MINUTES + not redeemed.
  if (hasTeam && memberTeamId) {
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
      if (isOpen && !checkedInAt) checkinPending = 1;
    }
  }

  const total =
    unreadMessages +
    pendingScrims +
    pendingJoinRequests +
    pendingInvites +
    checkinPending;

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
    total,
  });
});
