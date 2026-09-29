// features/player/matches/service/list.ts — « Mes matchs » : TOUS les matchs
// (à venir + passés) de l'équipe de la joueuse, triés par date décroissante.
// Généralise /api/player/next-match. Par match : côté joué, adversaire, score
// relatif, résultat, tournoi, check-in (match encore jouable et daté) et
// `canReportScore` (même règle que la déclaration, cf. reportRight.ts).

import { resolveMembership } from '@/utils/teams/memberships';
import {
  exposesCheckin,
  loadCheckinPermission,
} from '@/utils/teams/canCheckIn';
import {
  buildCheckin,
  derivePlayerScore,
  inferBestOf,
  resolvePlayerSide,
} from '@/utils/matches/playerMatchView';
import { PlayerError } from '@/utils/player/errors';
import * as repo from '../repository';
import type { PlayerMatch, PlayerMatchesPayload } from '../schemas';
import type { MatchesCtx } from './context';
import {
  loadReportableTeamIds,
  mayReportFor,
  REPORT_CLOSED_STATUSES,
} from './reportRight';

export async function listPlayerMatches(
  ctx: MatchesCtx,
  requestedTeamId: string | null
): Promise<PlayerMatchesPayload> {
  const { db, tenantId, userId } = ctx;

  // L'équipe demandée (`?teamId=`) quand un manager en gère plusieurs, la
  // sienne sinon.
  const membership = await resolveMembership(userId, tenantId, requestedTeamId);
  const teamId = membership?.team_id;
  if (!teamId) return { team: null, matches: [] };

  // Nom résolu indépendamment de la liste : une équipe sans match garde un
  // `team` non nul (l'écran distingue « pas d'équipe » de « pas de match »).
  const teamRow = await repo.readTeamWithCaptain(db, teamId);
  const myTeam = teamRow
    ? { id: teamRow.id, name: teamRow.name }
    : { id: teamId, name: '' };
  // Une seule lecture pour toute la liste (capitanat ∪ manager, cf.
  // reportRight.ts) ; la décision, elle, se prend par match — l'adversaire
  // change, et tenir les deux côtés retire le droit. Lecture en échec : le
  // bouton disparaît (la route d'écriture, elle, répondrait 500).
  const reportable = await loadReportableTeamIds(db, tenantId, userId).catch(
    (e: unknown) => {
      ctx.logger.error('[/api/player/matches] report right error:', e);
      return new Set<string>();
    }
  );

  // Check-in : UNE décision pour la liste ; le jeton ne sort que pour la
  // capitaine / coach / manager.
  const mayCheckIn = exposesCheckin(
    await loadCheckinPermission(userId, tenantId, teamId)
  );

  const { rows, error } = await repo.listTeamMatches(db, tenantId, teamId);
  if (error) {
    ctx.logger.error('[/api/player/matches] error:', error);
    throw new PlayerError(500, 'internal', 'Failed to load matches');
  }

  const now = Date.now();
  const matches: PlayerMatch[] = rows.map((match) => {
    const side = resolvePlayerSide(match, teamId);
    const { score, result } = derivePlayerScore(match, side.isTeam1, teamId);
    const status = match.status as string;
    const scheduledAt = (match.scheduled_at as string | null) ?? null;

    // Exposé UNIQUEMENT pour un match encore jouable et daté ; `ongoing` en
    // fait partie (le serveur accepte encore le jeton, et « Check-in validé »
    // est ce qu'on vient vérifier quand le staff lance le match).
    const checkin: PlayerMatch['checkin'] =
      (status === 'pending' || status === 'ongoing') && scheduledAt
        ? (() => {
            const c = buildCheckin(match, side.isTeam1, now);
            return {
              token: mayCheckIn ? c.token : null,
              canCheckIn: mayCheckIn,
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
        mayReportFor(reportable, teamId, side.opponent?.id) &&
        !REPORT_CLOSED_STATUSES.has(status),
    };
  });

  return { team: myTeam, matches };
}
