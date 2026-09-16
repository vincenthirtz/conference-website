// pages/api/player/next-match.ts
// GET — returns the next upcoming match for the authenticated user's team,
// plus check-in metadata (token + status + window opening).
//
// "Next" = a pending match whose check-in is open for us first, otherwise the
// nearest of: pending matches scheduled >= now-1h, and ongoing matches of ANY
// age (a late evening must not hide the match being played). See
// pickNextMatch. Returns null if the user has no team or no upcoming match.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveMembership } from '@/utils/teams/memberships';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import {
  NEXT_MATCH_PENDING_GRACE_MINUTES,
  PLAYER_MATCH_SELECT,
  buildCheckin,
  inferBestOf,
  pickNextMatch,
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

  // Candidats, en DEUX requêtes plutôt qu'un filtre combiné :
  //   - les `pending`/`ongoing` programmés depuis moins d'une heure (le filtre
  //     historique : une capitaine qui revient juste après le coup d'envoi
  //     veut encore voir son match) ;
  //   - les `ongoing` QUEL QUE SOIT leur horaire. Une soirée en retard garde
  //     un match de 19:00 en cours à 20:05 : le filtre sur `scheduled_at` le
  //     faisait disparaître du dashboard en plein match.
  // Pas de `.or()` combiné à celui des équipes : supabase-js ajouterait un
  // second paramètre `or=` à la requête PostgREST, et on ne mise pas une
  // soirée de match sur la façon dont il les compose. Le choix final
  // (priorité au check-in ouvert) est une fonction pure : pickNextMatch.
  const now = Date.now();
  const cutoffISO = new Date(
    now - NEXT_MATCH_PENDING_GRACE_MINUTES * 60_000
  ).toISOString();
  const teamFilter = `team1_id.eq.${teamId},team2_id.eq.${teamId}`;

  const [recent, live] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select(PLAYER_MATCH_SELECT)
      .or(teamFilter)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'ongoing'])
      .gte('scheduled_at', cutoffISO)
      .order('scheduled_at', { ascending: true })
      .limit(5),
    supabaseAdmin
      .from('matches')
      .select(PLAYER_MATCH_SELECT)
      .or(teamFilter)
      .eq('tenant_id', tenantId)
      .eq('status', 'ongoing')
      .order('scheduled_at', { ascending: false })
      .limit(3),
  ]);

  const error = recent.error ?? live.error;
  if (error) {
    logger.error('[/api/player/next-match] error:', error);
    return res.status(500).json({ error: 'Failed to load next match' });
  }

  const match = pickNextMatch(
    [...(recent.data ?? []), ...(live.data ?? [])] as unknown as Record<
      string,
      unknown
    >[],
    teamId,
    now
  );
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
  const side = resolvePlayerSide(match, teamId);
  const checkin = buildCheckin(match, side.isTeam1, now);
  const scheduledAt = (match.scheduled_at as string | null) ?? null;
  const formatStr = (match.match_format as string | null) ?? null;

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json({
    match: {
      id: match.id as string,
      scheduledAt,
      status: match.status as string,
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
