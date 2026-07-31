// pages/api/player/matches.ts
// GET — lists ALL matches (upcoming + past) for the authenticated user's team,
// scoped to the resolved tenant. Generalises /api/player/next-match (which
// returns only the single next match) to the full list backing the player
// "Mes matchs" page.
//
// Ordered by scheduled_at DESC. No status filter — completed, ongoing and
// pending matches are all returned. Per match we expose the user's slot, the
// opponent, the score relative to the user's slot, a derived win/loss/draw
// result, the tournament, and (for still-actionable pending matches with a
// scheduled_at) the check-in window/token.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';

import { logger } from '../../../utils/logger';

export type PlayerMatch = {
  id: string;
  scheduledAt: string | null;
  status: string;
  roundName: string | null;
  format: string | null;
  bestOf: number | null;
  streamUrl: string | null;
  slot: 1 | 2;
  opponent: { id: string; name: string } | null;
  score: { mine: number | null; opponent: number | null } | null;
  result: 'win' | 'loss' | 'draw' | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    token: string | null;
    alreadyCheckedIn: boolean;
    /** Window opens at scheduledAt - CHECKIN_OPEN_MINUTES, closes at scheduledAt. */
    opensAt: string | null;
    closesAt: string | null;
    /** Convenience flags for the UI; computed from server clock. */
    isOpen: boolean;
    isPassed: boolean;
  } | null;
};

export type PlayerMatchesPayload = {
  team: { id: string; name: string } | null;
  matches: PlayerMatch[];
};

type TeamRef = { id: string; name: string } | null;

/** PostgREST embeds come back as object|array depending on FK cardinality. */
function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerMatchesPayload | { error: string }>,
  { subject }
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-matches')
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, tenantId } = subject;

  // Find the user's team for this tenant.
  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const teamId = membership?.team_id;
  if (!teamId) {
    return res.status(200).json({ team: null, matches: [] });
  }

  // Resolve the team name independently of the matches list, so a player with
  // a team but zero matches still gets a non-null `team` (the UI distinguishes
  // "no team" from "no matches" on this field).
  const { data: teamRow } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle();
  const myTeam: TeamRef = teamRow
    ? { id: teamRow.id as string, name: teamRow.name as string }
    : { id: teamId, name: '' };

  // Pull every match where this team is team1 or team2 (any status).
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
    logger.error('[/api/player/matches] error:', error);
    return res.status(500).json({ error: 'Failed to load matches' });
  }

  const now = Date.now();

  const matches: PlayerMatch[] = (rows ?? []).map((match) => {
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

    // Score relative to the user's slot. null if both sides are null.
    const team1Score = (match.team1_score as number | null) ?? null;
    const team2Score = (match.team2_score as number | null) ?? null;
    const myScore = isTeam1 ? team1Score : team2Score;
    const oppScore = isTeam1 ? team2Score : team1Score;
    const score =
      myScore === null && oppScore === null
        ? null
        : { mine: myScore, opponent: oppScore };

    // Derive win/loss/draw.
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

    // Check-in metadata — only for still-actionable pending matches that have a
    // scheduled_at. Past/ongoing/completed matches get a null checkin block.
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

    // Match-format BO inference (best-of); fallback to null when unknown.
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

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json({ team: myTeam, matches });
});
