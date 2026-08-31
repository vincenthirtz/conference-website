// pages/api/player/matches/[matchId].ts
//
// GET — UN match, vu par quelqu'un qui le joue. C'est la donnée du « fil du
// match » (docs/PLAN-espace-joueur.md § J1).
//
// Pourquoi une route de plus alors que /api/player/matches existe : la liste
// répond « quels matchs ai-je ? », pas « où en est CELUI-CI ? ». Le fil a
// besoin de choses que la liste n'a aucune raison de porter 100 fois — la
// composition de l'effectif attendue, l'état des reports de score, et surtout
// CE QUE L'APPELANT A LE DROIT DE FAIRE. Le tout dérivé du même helper que les
// deux autres routes (utils/matches/playerMatchView.ts).
//
// Deux règles d'accès, volontairement distinctes :
//
//   1. VOIR le fil = appartenir à l'une des deux équipes. Un tiers reçoit 404
//      et pas 403 : « ce match ne te regarde pas » n'a pas à confirmer qu'il
//      existe.
//   2. AGIR : chaque geste porte sa propre permission, et la réponse les
//      annonce (`permissions`) pour que l'écran n'affiche jamais un bouton que
//      le serveur refusera. Le rapport de score reste au CAPITAINE au sens
//      strict (`teams.captain_id`), miroir exact de report-score.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { listMemberships } from '@/utils/teams/memberships';
import { getManagedTeams } from '@/utils/teams/managementAccess';
import {
  PLAYER_MATCH_SELECT,
  buildCheckin,
  derivePlayerScore,
  inferBestOf,
  resolvePlayerSide,
  type PlayerCheckin,
  type TeamRef,
  type TournamentRef,
} from '@/utils/matches/playerMatchView';

import { logger } from '../../../../utils/logger';

/** État du rapport de score, du point de vue de MON équipe. */
export type ScoreReportState =
  | 'none'
  | 'awaiting_opponent'
  | 'awaiting_me'
  | 'agreed'
  | 'disputed';

export type PlayerMatchDetail = {
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    format: string | null;
    bestOf: number | null;
    roundName: string | null;
    streamUrl: string | null;
  };
  team: { id: string; name: string; slot: 1 | 2 };
  opponent: TeamRef;
  tournament: TournamentRef;
  checkin: PlayerCheckin;
  /**
   * Effectif comparé au minimum du tournoi. `null` quand le tournoi n'en
   * impose pas — afficher « 0 manquante » sur un tournoi sans minimum ferait
   * croire à une règle qui n'existe pas.
   */
  readiness: {
    minPlayers: number | null;
    rosterSize: number;
    shortfall: number;
  } | null;
  score: { mine: number | null; opponent: number | null } | null;
  result: 'win' | 'loss' | 'draw' | null;
  report: {
    state: ScoreReportState;
    /** Ce que MON équipe a déjà déclaré, `null` si rien. */
    mine: { mine: number; opponent: number } | null;
  };
  /**
   * Ce que l'appelant peut faire ICI. Calculé côté serveur avec les mêmes
   * règles que les routes d'écriture : l'écran n'a plus à les deviner.
   */
  permissions: {
    validateLineup: boolean;
    reportScore: boolean;
  };
};

type ErrorBody = { error: string; code?: string };

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerMatchDetail | ErrorBody>,
  { subject }
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'player-match-detail'
    )
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const matchId = String(req.query.matchId || '');
  if (!matchId) {
    return res.status(400).json({ error: 'matchId required' });
  }

  const { userId, tenantId } = subject;

  const { data: row, error } = await supabaseAdmin
    .from('matches')
    .select(PLAYER_MATCH_SELECT)
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[/api/player/matches/[matchId]] load error:', error);
    return res.status(500).json({ error: 'Failed to load match' });
  }

  const match = row as Record<string, unknown> | null;
  if (!match) {
    return res
      .status(404)
      .json({ error: 'Match not found', code: 'not_found' });
  }

  // Garde d'accès : être membre de l'une des deux équipes. On lit TOUTES les
  // appartenances — un manager multi-équipes peut suivre le match de n'importe
  // laquelle des siennes, et son appartenance « de travail » n'est pas
  // forcément celle qui joue ce match-là.
  const memberships = await listMemberships(userId, tenantId);
  const sides = [match.team1_id, match.team2_id].filter(Boolean) as string[];
  const mine = memberships.find((m) => sides.includes(m.team_id));

  // Une capitaine n'est pas nécessairement dans `team_members` de son équipe
  // (le capitanat vit sur `teams.captain_id`) : on complète par les équipes
  // gérées avant de conclure à un refus.
  const managed = mine ? [] : await getManagedTeams(userId, tenantId);
  const managedSide = managed.find((a) => sides.includes(a.teamId));

  const teamId = mine?.team_id ?? managedSide?.teamId ?? null;
  if (!teamId) {
    return res
      .status(404)
      .json({ error: 'Match not found', code: 'not_found' });
  }

  const side = resolvePlayerSide(match, teamId);
  const now = Date.now();
  const checkin = buildCheckin(match, side.isTeam1, now);
  const { score, result } = derivePlayerScore(match, side.isTeam1, teamId);

  // Effectif : compté sur le roster ENTIER de l'équipe, comme le fait le
  // dashboard — la règle du tournoi porte sur les inscrites, pas sur celles
  // qui sont alignées ce soir-là.
  const { count: rosterCount, error: rosterErr } = await supabaseAdmin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);
  if (rosterErr) {
    logger.error('[/api/player/matches/[matchId]] roster error:', rosterErr);
  }
  const rosterSize = rosterCount ?? 0;
  const minPlayers = side.minPlayers;
  const readiness =
    minPlayers === null
      ? null
      : {
          minPlayers,
          rosterSize,
          shortfall: minPlayers > rosterSize ? minPlayers - rosterSize : 0,
        };

  // Reports de score : l'état se lit à deux, jamais à un. « J'ai déclaré » ne
  // veut rien dire sans savoir si l'adversaire l'a fait, et s'il dit pareil.
  const { data: reports, error: reportsErr } = await supabaseAdmin
    .from('match_score_reports')
    .select('team_side, team1_score, team2_score')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);
  if (reportsErr) {
    logger.error('[/api/player/matches/[matchId]] reports error:', reportsErr);
  }

  const mySide = side.slot;
  const myReport = (reports ?? []).find((r) => r.team_side === mySide) ?? null;
  const oppReport = (reports ?? []).find((r) => r.team_side !== mySide) ?? null;

  const status = match.status as string;
  let reportState: ScoreReportState = 'none';
  if (status === 'disputed') reportState = 'disputed';
  else if (myReport && oppReport) reportState = 'agreed';
  else if (myReport) reportState = 'awaiting_opponent';
  else if (oppReport) reportState = 'awaiting_me';

  // Permissions, calquées sur les routes qui écrivent :
  //  - feuille de match → permission d'équipe `validate_lineup` ;
  //  - report de score  → `teams.captain_id` au sens strict (report-score.ts).
  const access = managed.length
    ? managed
    : await getManagedTeams(userId, tenantId);
  const myAccess = access.find((a) => a.teamId === teamId) ?? null;

  const { data: teamRow } = await supabaseAdmin
    .from('teams')
    .select('captain_id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const isCaptain =
    (teamRow as { captain_id?: string | null } | null)?.captain_id === userId;

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json({
    match: {
      id: match.id as string,
      scheduledAt: (match.scheduled_at as string | null) ?? null,
      status,
      format: (match.match_format as string | null) ?? null,
      bestOf: inferBestOf(match.match_format as string | null),
      roundName: (match.round_name as string | null) ?? null,
      streamUrl: (match.stream_url as string | null) ?? null,
    },
    team: {
      id: teamId,
      name: side.myTeam?.name ?? '',
      slot: side.slot,
    },
    opponent: side.opponent,
    tournament: side.tournament,
    checkin,
    readiness,
    score,
    result,
    report: {
      state: reportState,
      mine: myReport
        ? {
            mine: (side.isTeam1
              ? myReport.team1_score
              : myReport.team2_score) as number,
            opponent: (side.isTeam1
              ? myReport.team2_score
              : myReport.team1_score) as number,
          }
        : null,
    },
    permissions: {
      validateLineup: !!myAccess?.permissions.includes('validate_lineup'),
      reportScore: isCaptain,
    },
  });
});
