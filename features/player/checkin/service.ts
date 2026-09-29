// features/player/checkin/service.ts — le prochain match de l'équipe de la
// joueuse, avec l'état de son check-in (lot P12). Extrait TEL QUEL de
// /api/player/next-match : aucune règle ne change.
//
// « Prochain » = un match `pending` dont le check-in est ouvert pour nous
// d'abord, sinon le plus proche parmi les `pending` programmés depuis moins
// d'une heure et les `ongoing` DE TOUT ÂGE (une soirée en retard ne doit pas
// cacher le match en cours). Choix final : pickNextMatch (pur).
//
// Le JETON (clé de POST /api/checkin/{token}) ne sort que pour qui peut
// pointer — capitaine, coach, manager (utils/teams/canCheckIn.ts).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import { PlayerError } from '@/utils/player/errors';
import { resolveMembership } from '@/utils/teams/memberships';
import {
  applyCheckinPermission,
  exposesCheckin,
  loadCheckinPermission,
} from '@/utils/teams/canCheckIn';
import {
  NEXT_MATCH_PENDING_GRACE_MINUTES,
  buildCheckin,
  inferBestOf,
  pickNextMatch,
  resolvePlayerSide,
} from '@/utils/matches/playerMatchView';
import * as repo from './repository';
import type { NextMatchPayload } from './schemas';

export type CheckinCtx = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  userId: string;
};

const NO_MATCH: NextMatchPayload = {
  match: null,
  team: null,
  opponent: null,
  tournament: null,
  checkin: null,
};

export async function getNextMatch(
  ctx: CheckinCtx,
  requestedTeamId: string | null
): Promise<NextMatchPayload> {
  const { db, tenantId, userId } = ctx;
  // L'équipe demandée (`?teamId=`, manager multi-équipes), la sienne sinon.
  const membership = await resolveMembership(userId, tenantId, requestedTeamId);
  const teamId = membership?.team_id;
  if (!teamId) return NO_MATCH;

  const now = Date.now();
  const cutoffISO = new Date(
    now - NEXT_MATCH_PENDING_GRACE_MINUTES * 60_000
  ).toISOString();
  const { rows, error } = await repo.readNextMatchCandidates(
    db,
    tenantId,
    teamId,
    cutoffISO
  );
  if (error) {
    ctx.logger.error('[/api/player/next-match] error:', error);
    throw new PlayerError(500, 'internal', 'Failed to load next match');
  }

  const match = pickNextMatch(rows, teamId, now);
  if (!match) return NO_MATCH;

  const side = resolvePlayerSide(match, teamId);
  // Lecture de la permission en échec → comportement d'avant (exposesCheckin).
  const checkin = applyCheckinPermission(
    buildCheckin(match, side.isTeam1, now),
    exposesCheckin(await loadCheckinPermission(userId, tenantId, teamId))
  );
  const formatStr = (match.match_format as string | null) ?? null;

  return {
    match: {
      id: match.id as string,
      scheduledAt: (match.scheduled_at as string | null) ?? null,
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
  };
}
