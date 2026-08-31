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
import {
  PLAYER_MATCH_SELECT,
  buildCheckin,
  inferBestOf,
  resolvePlayerSide,
} from '@/utils/matches/playerMatchView';

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
    .select(PLAYER_MATCH_SELECT)
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

  // Côté joué, adversaire, check-in : dérivations partagées avec
  // /api/player/matches et /api/player/matches/[matchId] (helper unique).
  const side = resolvePlayerSide(match as Record<string, unknown>, teamId);
  const checkin = buildCheckin(match as Record<string, unknown>, side.isTeam1);
  const scheduledAt = match.scheduled_at as string | null;
  const formatStr = (match.match_format as string | null) ?? null;

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json({
    match: {
      id: match.id,
      scheduledAt,
      status: match.status,
      format: formatStr,
      roundName: (match.round_name as string | null) ?? null,
      streamUrl: (match.stream_url as string | null) ?? null,
      bestOf: inferBestOf(formatStr),
    },
    team: side.myTeam
      ? { id: side.myTeam.id, name: side.myTeam.name, slot: side.slot }
      : null,
    opponent: side.opponent
      ? { id: side.opponent.id, name: side.opponent.name }
      : null,
    tournament: side.tournament,
    checkin,
  });
});
