// pages/api/player/next-match.ts
// GET — returns the next upcoming match for the authenticated user's team,
// plus check-in metadata (token + status + window opening).
//
// "Next" = nearest scheduled_at >= now-1h, ongoing matches included so an
// in-progress match still surfaces. Returns null if the user has no team
// or no upcoming match.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveMembership } from '@/utils/teams/memberships';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';

import { logger } from '../../../utils/logger';
export type NextMatchPayload =
  | {
      match: {
        id: string;
        scheduledAt: string | null;
        status: string;
        format: string | null;
        roundName: string | null;
        streamUrl: string | null;
        bestOf: number | null;
      } | null;
      team: {
        id: string;
        name: string;
        slot: 1 | 2;
      } | null;
      opponent: { id: string; name: string } | null;
      tournament: { id: string; name: string; slug: string | null } | null;
      checkin: {
        token: string | null;
        alreadyCheckedIn: boolean;
        checkedInAt: string | null;
        /** Window opens at scheduledAt - CHECKIN_OPEN_MINUTES, closes at scheduledAt. */
        opensAt: string | null;
        closesAt: string | null;
        /** Convenience flags for the UI; computed from server clock. */
        isOpen: boolean;
        isPassed: boolean;
      };
    }
  | {
      match: null;
      team: null;
      opponent: null;
      tournament: null;
      checkin: null;
    };

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NextMatchPayload | { error: string }>,
  { subject }
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'next-match')) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, tenantId } = subject;

  // Find the user's active team (member or captain) — the one the screen asked
  // for (`?teamId=`) when a manager runs several, their own otherwise.
  const membership = await resolveMembership(
    userId,
    tenantId,
    readRequestedTeamId(req)
  );

  const teamId = membership?.team_id;
  if (!teamId) {
    return res.status(200).json({
      match: null,
      team: null,
      opponent: null,
      tournament: null,
      checkin: null,
    });
  }

  // Pull the next match where this team is team1 or team2.
  // We include ongoing matches and matches scheduled within the past hour
  // (a captain returning right after kickoff still wants to see the match).
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
      tournament:tournament_id(id, name, slug)
      `
    )
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'ongoing'])
    .gte('scheduled_at', cutoffISO)
    .order('scheduled_at', { ascending: true })
    .limit(1);

  if (error) {
    logger.error('[/api/player/next-match] error:', error);
    return res.status(500).json({ error: 'Failed to load next match' });
  }

  const match = matches?.[0];
  if (!match) {
    return res.status(200).json({
      match: null,
      team: null,
      opponent: null,
      tournament: null,
      checkin: null,
    });
  }

  const isTeam1 = match.team1_id === teamId;
  const slot: 1 | 2 = isTeam1 ? 1 : 2;
  const team = (Array.isArray(match.team1) ? match.team1[0] : match.team1) as {
    id: string;
    name: string;
  } | null;
  const opp = (Array.isArray(match.team2) ? match.team2[0] : match.team2) as {
    id: string;
    name: string;
  } | null;
  const myTeam = isTeam1 ? team : opp;
  const opponent = isTeam1 ? opp : team;
  const tn = (
    Array.isArray(match.tournament) ? match.tournament[0] : match.tournament
  ) as { id: string; name: string; slug: string | null } | null;

  const token = isTeam1 ? match.team1_checkin_token : match.team2_checkin_token;
  const checkedInAt = isTeam1
    ? match.team1_checked_in_at
    : match.team2_checked_in_at;

  const scheduledAt = match.scheduled_at as string | null;
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

  // Match-format BO inference (best-of); fallback to null when unknown.
  const formatStr = (match.match_format as string | null) ?? null;
  const bestOf = formatStr
    ? Number.parseInt(formatStr.replace(/[^\d]/g, ''), 10) || null
    : null;

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json({
    match: {
      id: match.id,
      scheduledAt,
      status: match.status,
      format: formatStr,
      roundName: (match.round_name as string | null) ?? null,
      streamUrl: (match.stream_url as string | null) ?? null,
      bestOf,
    },
    team: myTeam ? { id: myTeam.id, name: myTeam.name, slot } : null,
    opponent: opponent ? { id: opponent.id, name: opponent.name } : null,
    tournament: tn,
    checkin: {
      token: (token as string | null) ?? null,
      alreadyCheckedIn: !!checkedInAt,
      checkedInAt: (checkedInAt as string | null) ?? null,
      opensAt,
      closesAt,
      isOpen,
      isPassed,
    },
  });
});
