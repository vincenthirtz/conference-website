// features/player/matches/service/detail.ts — UN match, vu par quelqu'un qui
// le joue : la donnée du « fil du match » (docs/PLAN-espace-joueur.md § J1).
//
// Deux règles d'accès, volontairement distinctes :
//   1. VOIR le fil = appartenir à l'une des deux équipes. Un tiers reçoit 404
//      et pas 403 : « ce match ne te regarde pas » n'a pas à confirmer qu'il
//      existe.
//   2. AGIR : chaque geste porte sa propre permission, et la réponse les
//      annonce (`permissions`) pour que l'écran n'affiche jamais un bouton que
//      le serveur refusera (feuille = `validate_lineup`, report = reportRight).

import { listMemberships } from '@/utils/teams/memberships';
import { getManagedTeams } from '@/utils/teams/managementAccess';
import {
  applyCheckinPermission,
  exposesCheckin,
  loadCheckinPermission,
} from '@/utils/teams/canCheckIn';
import {
  buildCheckin,
  derivePlayerScore,
  inferBestOf,
  resolvePlayerSide,
} from '@/utils/matches/playerMatchView';
import {
  computeScoreReportState,
  isStaffOpenedDispute,
} from '@/utils/matches/scoreReports';
import { getSlaMinutes } from '@/utils/disputes/slaBreaches';
import { LegacyAdminError } from '@/utils/admin/errors';
import { PlayerError } from '@/utils/player/errors';
import * as repo from '../repository';
import type { PlayerMatchDetail, PlayerMatchDispute } from '../schemas';
import type { MatchesCtx } from './context';
import { loadReportableTeamIds, mayReportFor } from './reportRight';

const notFound = () =>
  new LegacyAdminError(404, 'Match not found', { code: 'not_found' });

type Scores = { team1_score: number; team2_score: number };

/** Un report absolu (team1/team2) lu dans la perspective de MON équipe. */
function inMyPerspective(report: Scores, isTeam1: boolean) {
  return {
    mine: isTeam1 ? report.team1_score : report.team2_score,
    opponent: isTeam1 ? report.team2_score : report.team1_score,
  };
}

/**
 * Le litige tel que la joueuse le voit. Appelé SEULEMENT quand le match est
 * `disputed` : avant, la déclaration adverse ne sort pas (cf. schemas.ts).
 * Lecture de la méta en échec → litige sans date plutôt qu'un fil cassé.
 */
async function buildDispute(
  ctx: MatchesCtx,
  matchId: string,
  oppReport: Scores | null,
  isTeam1: boolean
): Promise<PlayerMatchDispute> {
  const [{ meta, error }, slaMinutes] = await Promise.all([
    repo.readDisputeMeta(ctx.db, ctx.tenantId, matchId),
    getSlaMinutes(ctx.tenantId),
  ]);
  if (error) {
    ctx.logger.error('[/api/player/matches/[matchId]] dispute meta:', error);
  }
  const openedAt = meta?.dispute_opened_at ?? null;
  const openedMs = openedAt ? Date.parse(openedAt) : Number.NaN;
  return {
    opponentReport: oppReport ? inMyPerspective(oppReport, isTeam1) : null,
    openedAt,
    slaMinutes,
    expectedBy: Number.isFinite(openedMs)
      ? new Date(openedMs + slaMinutes * 60_000).toISOString()
      : null,
    openedByStaff: isStaffOpenedDispute({
      status: 'disputed',
      dispute_opened_by: meta?.dispute_opened_by ?? null,
    }),
  };
}

export async function getPlayerMatchDetail(
  ctx: MatchesCtx,
  rawMatchId: unknown
): Promise<PlayerMatchDetail> {
  const { db, tenantId, userId } = ctx;
  const matchId = String(rawMatchId || '');
  if (!matchId) {
    throw new LegacyAdminError(400, 'matchId required');
  }

  const { match, error } = await repo.readPlayerMatch(db, tenantId, matchId);
  if (error) {
    ctx.logger.error('[/api/player/matches/[matchId]] load error:', error);
    throw new PlayerError(500, 'internal', 'Failed to load match');
  }
  if (!match) throw notFound();

  // Garde d'accès : TOUTES les appartenances — un manager multi-équipes suit
  // le match de n'importe laquelle des siennes.
  const memberships = await listMemberships(userId, tenantId);
  const sides = [match.team1_id, match.team2_id].filter(Boolean) as string[];
  const mine = memberships.find((m) => sides.includes(m.team_id));

  // Une capitaine n'est pas nécessairement dans `team_members` (le capitanat
  // vit sur `teams.captain_id`) : on complète par les équipes gérées.
  const managed = mine ? [] : await getManagedTeams(userId, tenantId);
  const managedSide = managed.find((a) => sides.includes(a.teamId));

  const teamId = mine?.team_id ?? managedSide?.teamId ?? null;
  if (!teamId) throw notFound();

  const side = resolvePlayerSide(match, teamId);
  const now = Date.now();
  const { score, result } = derivePlayerScore(match, side.isTeam1, teamId);

  // Le jeton est la clé du check-in (POST /api/checkin/{token} ne demande
  // rien d'autre) : il ne sort que pour capitaine / coach / manager.
  const checkin = applyCheckinPermission(
    buildCheckin(match, side.isTeam1, now),
    exposesCheckin(await loadCheckinPermission(userId, tenantId, teamId))
  );

  // Effectif : roster ENTIER (la règle du tournoi porte sur les inscrites).
  const roster = await repo.countRoster(db, tenantId, teamId);
  if (roster.error) {
    ctx.logger.error(
      '[/api/player/matches/[matchId]] roster error:',
      roster.error
    );
  }
  const rosterSize = roster.count;
  const minPlayers = side.minPlayers;
  const readiness =
    minPlayers === null
      ? null
      : {
          minPlayers,
          rosterSize,
          shortfall: minPlayers > rosterSize ? minPlayers - rosterSize : 0,
        };

  // Reports : l'état se lit à deux, jamais à un.
  const { reports, error: reportsErr } = await repo.readScoreReports(
    db,
    tenantId,
    matchId
  );
  if (reportsErr) {
    ctx.logger.error(
      '[/api/player/matches/[matchId]] reports error:',
      reportsErr
    );
  }
  const mySide = side.slot;
  const myReport = (reports ?? []).find((r) => r.team_side === mySide) ?? null;
  const oppReport = (reports ?? []).find((r) => r.team_side !== mySide) ?? null;

  // « D'accord » exige deux reports ÉGAUX (cf. computeScoreReportState).
  const status = match.status as string;
  const reportState = computeScoreReportState(status, myReport, oppReport);
  // Litige OUVERT seulement : deux reports divergents sans dispute ouverte
  // (course entre deux écritures) ne dévoilent rien.
  const dispute =
    status === 'disputed'
      ? await buildDispute(ctx, matchId, oppReport, side.isTeam1)
      : null;

  const access = managed.length
    ? managed
    : await getManagedTeams(userId, tenantId);
  const myAccess = access.find((a) => a.teamId === teamId) ?? null;
  // Droit de déclarer : même règle que report-score (reportRight.ts). Lecture
  // en échec → pas de bouton (l'écriture répondrait 500, pas un faux 403).
  const reportable = await loadReportableTeamIds(db, tenantId, userId).catch(
    (e: unknown) => {
      ctx.logger.error('[/api/player/matches/[matchId]] report right:', e);
      return new Set<string>();
    }
  );
  const opponentId =
    teamId === match.team1_id ? match.team2_id : match.team1_id;

  return {
    match: {
      id: match.id as string,
      scheduledAt: (match.scheduled_at as string | null) ?? null,
      status,
      format: (match.match_format as string | null) ?? null,
      bestOf: inferBestOf(match.match_format as string | null),
      roundName: (match.round_name as string | null) ?? null,
      streamUrl: (match.stream_url as string | null) ?? null,
    },
    team: { id: teamId, name: side.myTeam?.name ?? '', slot: side.slot },
    opponent: side.opponent,
    tournament: side.tournament,
    checkin,
    readiness,
    score,
    result,
    report: {
      state: reportState,
      mine: myReport ? inMyPerspective(myReport, side.isTeam1) : null,
      dispute,
    },
    permissions: {
      validateLineup: !!myAccess?.permissions.includes('validate_lineup'),
      reportScore: mayReportFor(
        reportable,
        teamId,
        (opponentId as string | null) ?? null
      ),
    },
  };
}
