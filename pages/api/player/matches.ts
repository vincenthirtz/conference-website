// pages/api/player/matches.ts
// GET — lists ALL matches (upcoming + past) for the authenticated user's team,
// scoped to the resolved tenant. Generalises /api/player/next-match (which
// returns only the single next match) to the full list backing the player
// "Mes matchs" page.
//
// Ordered by scheduled_at DESC. No status filter — completed, ongoing and
// pending matches are all returned. Per match we expose the user's slot, the
// opponent, the score relative to the user's slot, a derived win/loss/draw
// result, the tournament, (for still-playable pending/ongoing matches with a
// scheduled_at) the check-in window/token, and whether the user may report
// the score (`canReportScore`, same rule as report-score.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveMembership } from '@/utils/teams/memberships';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import {
  PLAYER_MATCH_SELECT,
  buildCheckin,
  derivePlayerScore,
  inferBestOf,
  resolvePlayerSide,
} from '@/utils/matches/playerMatchView';

import { logger } from '../../../utils/logger';

/** Miroir de TERMINAL_STATUSES dans report-score.ts (409 MATCH_FINALIZED). */
const REPORT_CLOSED_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

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
  /**
   * Le serveur acceptera-t-il un report de score de CETTE personne ? Même
   * règle que report-score.ts : capitaine au sens strict (`teams.captain_id`),
   * deux équipes assignées, match non clôturé. Le MOMENT (coup d'envoi passé)
   * reste au client, qui a l'horloge qui avance (utils/matches/playerMatchLive).
   */
  canReportScore: boolean;
};

export type PlayerMatchesPayload = {
  team: { id: string; name: string } | null;
  matches: PlayerMatch[];
};

type TeamRef = { id: string; name: string } | null;

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

  // Find the user's team for this tenant — the one the screen asked for
  // (`?teamId=`) when a manager runs several, their own otherwise.
  const membership = await resolveMembership(
    userId,
    tenantId,
    readRequestedTeamId(req)
  );

  const teamId = membership?.team_id;
  if (!teamId) {
    return res.status(200).json({ team: null, matches: [] });
  }

  // Resolve the team name independently of the matches list, so a player with
  // a team but zero matches still gets a non-null `team` (the UI distinguishes
  // "no team" from "no matches" on this field).
  const { data: teamRow } = await supabaseAdmin
    .from('teams')
    .select('id, name, captain_id')
    .eq('id', teamId)
    .maybeSingle();
  const myTeam: TeamRef = teamRow
    ? { id: teamRow.id as string, name: teamRow.name as string }
    : { id: teamId, name: '' };
  // Le bouton « Rapporter le score » s'affichait pour tout le roster, alors que
  // report-score.ts n'autorise que `teams.captain_id` : une joueuse remplissait
  // la modale pour lire « Vous n'êtes pas le capitaine ». Une seule lecture
  // pour toute la liste — c'est la même équipe sur chaque ligne.
  const isCaptain =
    !!teamRow &&
    (teamRow as { captain_id?: string | null }).captain_id === userId;

  // Pull every match where this team is team1 or team2 (any status).
  const { data: rows, error } = await supabaseAdmin
    .from('matches')
    .select(PLAYER_MATCH_SELECT)
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .eq('tenant_id', tenantId)
    .order('scheduled_at', { ascending: false })
    .limit(100);

  if (error) {
    logger.error('[/api/player/matches] error:', error);
    return res.status(500).json({ error: 'Failed to load matches' });
  }

  const now = Date.now();

  const matches: PlayerMatch[] = (rows ?? []).map((raw) => {
    const match = raw as unknown as Record<string, unknown>;
    // Côté joué, adversaire, score, check-in : dérivations partagées avec
    // /api/player/next-match et /api/player/matches/[matchId].
    const side = resolvePlayerSide(match, teamId);
    const { score, result } = derivePlayerScore(match, side.isTeam1, teamId);

    const status = match.status as string;
    const scheduledAt = (match.scheduled_at as string | null) ?? null;

    // Check-in : exposé UNIQUEMENT pour un match encore jouable et daté. Sur un
    // match passé, un bloc check-in se lirait comme une action encore ouverte.
    // `ongoing` en fait partie : le serveur accepte encore le jeton, et le bloc
    // disparaissait de « Mes matchs » à l'instant où le staff lançait le match
    // — « Check-in validé » compris, qui est ce qu'on vient vérifier.
    const checkin: PlayerMatch['checkin'] =
      (status === 'pending' || status === 'ongoing') && scheduledAt
        ? (() => {
            const c = buildCheckin(match, side.isTeam1, now);
            return {
              token: c.token,
              alreadyCheckedIn: c.alreadyCheckedIn,
              opensAt: c.opensAt,
              closesAt: c.closesAt,
              isOpen: c.isOpen,
              isPassed: c.isPassed,
            };
          })()
        : null;

    return {
      id: match.id as string,
      scheduledAt,
      status,
      roundName: (match.round_name as string | null) ?? null,
      format: (match.match_format as string | null) ?? null,
      bestOf: inferBestOf(match.match_format as string | null),
      streamUrl: (match.stream_url as string | null) ?? null,
      slot: side.slot,
      opponent: side.opponent
        ? { id: side.opponent.id, name: side.opponent.name }
        : null,
      score,
      result,
      tournament: side.tournament,
      checkin,
      canReportScore:
        isCaptain && !!side.opponent?.id && !REPORT_CLOSED_STATUSES.has(status),
    };
  });

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json({ team: myTeam, matches });
});
