// pages/api/player/dashboard.ts
// Aggregated player dashboard endpoint — collapses the previous 2-wave
// waterfall (/api/admin/teams/my + /api/demandes/captain + /api/demandes/join,
// then /api/teams/scrim-requests + /api/player/messages) plus next-match into a
// SINGLE GET. The managed team is resolved once via getManagedTeam, then every
// section query runs in parallel server-side.
//
// Response shape (matches what pages/player/index.tsx consumes so the client
// mapping is minimal):
//   {
//     team, members, isCaptain, isManager,
//     demandesCaptain, demandesJoin,
//     pendingScrims, unreadMessages,
//     nextMatch  // { ...NextMatchPayload, readiness: { minPlayers, rosterSize, shortfall } }
//   }
//
// Captain-only sections (pendingScrims, unreadMessages) are gated exactly like
// the legacy client gating: a non-captain/non-manager gets empty/zero values.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';

import { logger } from '../../../utils/logger';

type TeamRow = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
  is_joinable?: boolean;
  open_for_scrim?: boolean;
};

type MemberRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  specialty: string | null;
  is_substitute: boolean;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

type Demande = Record<string, unknown>;

type PendingScrim = {
  id: string;
  user_id: string | null;
  source: string | null;
  status: string;
  comment: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  user: {
    id: string | null;
    email: string | null;
    display_name: string | null;
    discord: string | null;
  } | null;
  /** Negotiation contract (cf. utils/teams/scrimNegotiation.ts). */
  scrimNego: {
    slots: string[];
    proposedBy: string | null;
    rounds: number;
    agreedSlot: string | null;
  };
  /** true when my team is the requester (payload.from_team_id). */
  iAmRequester: boolean;
  myTeamId: string;
};

type NextMatchSection = {
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    format: string | null;
    roundName: string | null;
    streamUrl: string | null;
    bestOf: number | null;
  } | null;
  team: { id: string; name: string; slot: 1 | 2 } | null;
  opponent: { id: string; name: string } | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    token: string | null;
    alreadyCheckedIn: boolean;
    checkedInAt: string | null;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    isPassed: boolean;
  } | null;
  /**
   * Match-readiness metadata derived from the tournament min_players and the
   * current roster size. `shortfall` > 0 means the team is under the minimum.
   */
  readiness: {
    minPlayers: number | null;
    rosterSize: number;
    shortfall: number;
  } | null;
};

export type PlayerDashboardPayload = {
  team: TeamRow | null;
  members: MemberRow[];
  isCaptain: boolean;
  isManager: boolean;
  demandesCaptain: Demande[];
  demandesJoin: Demande[];
  pendingScrims: PendingScrim[];
  unreadMessages: number;
  nextMatch: NextMatchSection;
};

const EMPTY_NEXT_MATCH: NextMatchSection = {
  match: null,
  team: null,
  opponent: null,
  tournament: null,
  checkin: null,
  readiness: null,
};

/** Deterministic conversation ID from two team UUIDs (mirrors player/messages). */
function conversationId(teamA: string, teamB: string): string {
  return teamA < teamB ? `${teamA}_${teamB}` : `${teamB}_${teamA}`;
}

/* -----------------------------------------------------------
 * Section loaders — each returns its slice and never throws so a single
 * failing section degrades gracefully instead of taking the whole dashboard
 * down (matches the per-section .catch() behavior the client used to have).
 * ---------------------------------------------------------*/

async function loadTeamAndMembers(
  userId: string,
  tenantId: string
): Promise<{
  team: TeamRow | null;
  members: MemberRow[];
  teamId: string | null;
}> {
  try {
    const { data: membership, error } = await supabaseAdmin
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    if (error || !membership) {
      if (error) logger.error('[player/dashboard] membership error:', error);
      return { team: null, members: [], teamId: null };
    }

    const teamId = (membership as Record<string, unknown>).team_id as string;

    const { data: teamRowRaw, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select(
        'id, slug, name, short_name, logo_url, country, description, is_joinable, open_for_scrim'
      )
      .eq('id', teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (teamErr || !teamRowRaw) {
      if (teamErr) logger.error('[player/dashboard] team error:', teamErr);
      return { team: null, members: [], teamId };
    }

    const teamRaw = teamRowRaw as Record<string, unknown>;

    const team: TeamRow = {
      id: teamRaw.id as string,
      slug: (teamRaw.slug as string | null) ?? null,
      name: teamRaw.name as string,
      short_name: (teamRaw.short_name as string | null) ?? null,
      logo_url: (teamRaw.logo_url as string | null) ?? null,
      country: (teamRaw.country as string | null) ?? null,
      description: (teamRaw.description as string | null) ?? null,
      is_joinable: (teamRaw.is_joinable as boolean | undefined) ?? false,
    };

    const { data: membersRaw, error: membersErr } = await supabaseAdmin
      .from('team_members')
      .select('id, user_id, role, battle_tag, specialty, is_substitute')
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (membersErr) {
      logger.error('[player/dashboard] members error:', membersErr);
      return { team, members: [], teamId };
    }

    return { team, members: (membersRaw || []) as MemberRow[], teamId };
  } catch (err) {
    logger.error('[player/dashboard] loadTeamAndMembers error:', err);
    return { team: null, members: [], teamId: null };
  }
}

async function loadDemandes(
  userId: string,
  tenantId: string,
  type: 'captain_request' | 'join'
): Promise<Demande[]> {
  try {
    const sel =
      type === 'join'
        ? '*, team:teams!team_id(id, name, short_name, logo_url)'
        : '*';
    const { data, error } = await supabaseAdmin
      .from('demandes')
      .select(sel)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(`[player/dashboard] demandes ${type} error:`, error);
      return [];
    }
    return (data || []) as unknown as Demande[];
  } catch (err) {
    logger.error(`[player/dashboard] demandes ${type} error:`, err);
    return [];
  }
}

async function loadPendingScrims(
  teamId: string,
  tenantId: string
): Promise<PendingScrim[]> {
  try {
    // Scrims AWAITING MY ACTION in both directions :
    //  - my team is a participant (target via team_id OR requester via
    //    payload.from_team_id), AND
    //  - the current proposal was NOT made by my team (it's my turn).
    // Two queries (one per direction) merged + deduped in code — the unit-test
    // supabase mock treats .or() as a no-op so we never rely on it.
    const [asTargetRes, asRequesterRes] = await Promise.all([
      supabaseAdmin
        .from('demandes')
        .select('*')
        .eq('team_id', teamId)
        .eq('tenant_id', tenantId)
        .eq('type', 'scrim')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('demandes')
        .select('*')
        .filter('payload->>from_team_id', 'eq', teamId)
        .eq('tenant_id', tenantId)
        .eq('type', 'scrim')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (asTargetRes.error || asRequesterRes.error) {
      logger.error(
        '[player/dashboard] pendingScrims error:',
        asTargetRes.error || asRequesterRes.error
      );
      return [];
    }

    const byId = new Map<string, Record<string, unknown>>();
    for (const d of [
      ...(asTargetRes.data || []),
      ...(asRequesterRes.data || []),
    ] as Record<string, unknown>[]) {
      byId.set(d.id as string, d);
    }

    // Keep only the demandes where it's MY turn (non-proposer).
    const demandes = Array.from(byId.values()).filter((d) => {
      const nego = readScrimNego((d.payload as Record<string, unknown>) || {});
      return nego.proposed_by !== teamId;
    });

    // Enrich with sender info (mirrors /api/teams/scrim-requests GET).
    // Batch-resolve every auth user_id in ONE RPC instead of N getUserById
    // round-trips; unknown ids simply stay absent from the Map (userInfo null).
    const profiles = await fetchAdminUserProfiles(
      (demandes || []).map((d) => d.user_id as string | null | undefined)
    );

    const enriched = (demandes || []).map((d: Record<string, unknown>) => {
      let userInfo: PendingScrim['user'] = null;
      if (d.user_id) {
        const p = profiles.get(d.user_id as string);
        if (p) {
          userInfo = {
            id: d.user_id as string,
            email: p.email || null,
            display_name: p.display_name || p.full_name || null,
            discord: p.discord || null,
          };
        }
      } else if (d.source === 'public' && d.payload) {
        const p = d.payload as Record<string, unknown>;
        userInfo = {
          id: null,
          email: (p.requester_email as string) || null,
          display_name: (p.requester_name as string) || null,
          discord: (p.requester_discord as string) || null,
        };
      }
      const payload = (d.payload as Record<string, unknown> | null) ?? null;
      const nego = readScrimNego(payload || {});
      const fromTeamId = (payload?.from_team_id as string | null) ?? null;
      return {
        id: d.id as string,
        user_id: (d.user_id as string | null) ?? null,
        source: (d.source as string | null) ?? null,
        status: d.status as string,
        comment: (d.comment as string | null) ?? null,
        payload,
        created_at: d.created_at as string,
        user: userInfo,
        scrimNego: {
          slots: nego.slots,
          proposedBy: nego.proposed_by,
          rounds: nego.rounds,
          agreedSlot: nego.agreed_slot,
        },
        iAmRequester: teamId === fromTeamId,
        myTeamId: teamId,
      };
    });
    return enriched;
  } catch (err) {
    logger.error('[player/dashboard] pendingScrims error:', err);
    return [];
  }
}

async function loadUnreadMessages(
  teamId: string,
  tenantId: string
): Promise<number> {
  try {
    const { data: messages, error } = await supabaseAdmin
      .from('demandes')
      .select('id, user_id, team_id, comment, payload, status, created_at')
      .eq('type', 'captain_message')
      .eq('tenant_id', tenantId)
      .or(`payload->>from_team_id.eq.${teamId},team_id.eq.${teamId}`)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[player/dashboard] unreadMessages error:', error);
      return 0;
    }

    // Group by conversation and count unread (incoming + pending) — mirrors
    // the reduce the client did over /api/player/messages conversations.
    const unreadByConv = new Map<string, number>();
    for (const msg of (messages || []) as Record<string, unknown>[]) {
      const payload = (msg.payload as Record<string, unknown>) || {};
      const convId =
        (payload.conversation_id as string) ||
        conversationId(
          (payload.from_team_id as string) || '',
          msg.team_id as string
        );
      const isIncoming = msg.team_id === teamId;
      const isUnread = isIncoming && msg.status === 'pending';
      if (isUnread) {
        unreadByConv.set(convId, (unreadByConv.get(convId) || 0) + 1);
      } else if (!unreadByConv.has(convId)) {
        unreadByConv.set(convId, 0);
      }
    }
    let total = 0;
    for (const n of unreadByConv.values()) total += n;
    return total;
  } catch (err) {
    logger.error('[player/dashboard] unreadMessages error:', err);
    return 0;
  }
}

async function loadNextMatch(
  teamId: string,
  tenantId: string,
  rosterSize: number
): Promise<NextMatchSection> {
  try {
    const cutoffISO = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: matches, error } = await supabaseAdmin
      .from('matches')
      .select(
        `
        id, status, scheduled_at, match_format, round_name, stream_url,
        team1_id, team2_id,
        team1_checkin_token, team2_checkin_token,
        team1_checked_in_at, team2_checked_in_at,
        team1:team1_id(id, name),
        team2:team2_id(id, name),
        tournament:tournament_id(id, name, slug, min_players)
        `
      )
      .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'ongoing'])
      .gte('scheduled_at', cutoffISO)
      .order('scheduled_at', { ascending: true })
      .limit(1);

    if (error) {
      logger.error('[player/dashboard] nextMatch error:', error);
      return EMPTY_NEXT_MATCH;
    }

    const match = matches?.[0] as Record<string, unknown> | undefined;
    if (!match) return EMPTY_NEXT_MATCH;

    const isTeam1 = match.team1_id === teamId;
    const slot: 1 | 2 = isTeam1 ? 1 : 2;
    const team1 = (
      Array.isArray(match.team1) ? match.team1[0] : match.team1
    ) as { id: string; name: string } | null;
    const team2 = (
      Array.isArray(match.team2) ? match.team2[0] : match.team2
    ) as { id: string; name: string } | null;
    const myTeam = isTeam1 ? team1 : team2;
    const opponent = isTeam1 ? team2 : team1;
    const tn = (
      Array.isArray(match.tournament) ? match.tournament[0] : match.tournament
    ) as {
      id: string;
      name: string;
      slug: string | null;
      min_players: number | null;
    } | null;

    const token = isTeam1
      ? (match.team1_checkin_token as string | null)
      : (match.team2_checkin_token as string | null);
    const checkedInAt = isTeam1
      ? (match.team1_checked_in_at as string | null)
      : (match.team2_checked_in_at as string | null);

    const scheduledAt = (match.scheduled_at as string | null) ?? null;
    const opensAt = scheduledAt
      ? new Date(
          new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
        ).toISOString()
      : null;
    const closesAt = scheduledAt;

    const now = Date.now();
    const isOpen =
      !!opensAt &&
      !!closesAt &&
      now >= new Date(opensAt).getTime() &&
      now <= new Date(closesAt).getTime();
    const isPassed = !!closesAt && now > new Date(closesAt).getTime();

    const formatStr = (match.match_format as string | null) ?? null;
    const bestOf = formatStr
      ? Number.parseInt(formatStr.replace(/[^\d]/g, ''), 10) || null
      : null;

    const minPlayers = tn?.min_players ?? null;
    const shortfall =
      typeof minPlayers === 'number' && minPlayers > rosterSize
        ? minPlayers - rosterSize
        : 0;

    return {
      match: {
        id: match.id as string,
        scheduledAt,
        status: match.status as string,
        format: formatStr,
        roundName: (match.round_name as string | null) ?? null,
        streamUrl: (match.stream_url as string | null) ?? null,
        bestOf,
      },
      team: myTeam ? { id: myTeam.id, name: myTeam.name, slot } : null,
      opponent: opponent ? { id: opponent.id, name: opponent.name } : null,
      tournament: tn
        ? { id: tn.id, name: tn.name, slug: tn.slug ?? null }
        : null,
      checkin: {
        token: token ?? null,
        alreadyCheckedIn: !!checkedInAt,
        checkedInAt: checkedInAt ?? null,
        opensAt,
        closesAt,
        isOpen,
        isPassed,
      },
      readiness: {
        minPlayers,
        rosterSize,
        shortfall,
      },
    };
  } catch (err) {
    logger.error('[player/dashboard] nextMatch error:', err);
    return EMPTY_NEXT_MATCH;
  }
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerDashboardPayload | { error: string }>,
  { user }
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-dashboard')
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = user.id;
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });

  // Resolve the managed team (captain or privileged member) once. This drives
  // both the captain-only gating and the team-id for next-match/scrims.
  const [teamSlice, access] = await Promise.all([
    loadTeamAndMembers(userId, tenantId),
    getManagedTeam(userId, tenantId),
  ]);

  const isCaptain = !!(access?.isCaptain && access.teamId === teamSlice.teamId);
  const isManager = !!(access?.isManager && access.teamId === teamSlice.teamId);
  const canManage = isCaptain || isManager;
  const rosterSize = teamSlice.members.length;

  // Everything below runs in parallel. Captain-only sections short-circuit to
  // empty values for plain players (same gating the client used to apply).
  const [
    demandesCaptain,
    demandesJoin,
    pendingScrims,
    unreadMessages,
    nextMatch,
  ] = await Promise.all([
    loadDemandes(userId, tenantId, 'captain_request'),
    loadDemandes(userId, tenantId, 'join'),
    canManage && teamSlice.teamId
      ? loadPendingScrims(teamSlice.teamId, tenantId)
      : Promise.resolve([] as PendingScrim[]),
    canManage && teamSlice.teamId
      ? loadUnreadMessages(teamSlice.teamId, tenantId)
      : Promise.resolve(0),
    teamSlice.teamId
      ? loadNextMatch(teamSlice.teamId, tenantId, rosterSize)
      : Promise.resolve(EMPTY_NEXT_MATCH),
  ]);

  return res.status(200).json({
    team: teamSlice.team,
    members: teamSlice.members,
    isCaptain,
    isManager,
    demandesCaptain,
    demandesJoin,
    pendingScrims,
    unreadMessages,
    nextMatch,
  });
});
