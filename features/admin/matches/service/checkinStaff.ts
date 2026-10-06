// features/admin/matches/service/checkinStaff.ts — pointage d'une équipe par
// le staff (console live, rattrapage du soir de tournoi). L'écriture et ses
// gardes vivent dans `utils/checkin.ts` (`staffCheckInTeam`), à côté de celles
// du jeton public : une seule définition de « qui peut encore pointer ».
//
// Le motif est obligatoire et part au journal staff : pointer à la place d'une
// équipe, c'est décider qu'elle est là — on doit pouvoir dire pourquoi.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { staffCheckInTeam, type StaffCheckinErrorCode } from '@/utils/checkin';
import type { Audited } from '../../_shared/audited';
import { withInternalError } from './internal';

export const CHECKIN_STAFF_REASON_MIN = 3;
export const CHECKIN_STAFF_REASON_MAX = 500;

const STATUS_BY_CODE: Record<StaffCheckinErrorCode, number> = {
  CHECKIN_MATCH_NOT_FOUND: 404,
  CHECKIN_TEAM_MISSING: 409,
  CHECKIN_MATCH_CLOSED: 409,
  CHECKIN_FORFEIT_PROCESSED: 409,
};

export async function checkInTeamAsStaff(
  ctx: ServiceContext,
  matchId: string,
  body: Record<string, unknown>
): Promise<
  Audited<{
    success: true;
    matchId: string;
    teamSide: 1 | 2;
    checkedInAt: string;
    alreadyCheckedIn: boolean;
  }>
> {
  const side = body.teamSide;
  if (side !== 1 && side !== 2) {
    throw new LegacyAdminError(400, 'teamSide must be 1 or 2');
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < CHECKIN_STAFF_REASON_MIN) {
    throw new LegacyAdminError(400, 'Un motif est obligatoire.', {
      code: 'REASON_REQUIRED',
    });
  }
  if (reason.length > CHECKIN_STAFF_REASON_MAX) {
    throw new LegacyAdminError(
      400,
      `Motif trop long (${CHECKIN_STAFF_REASON_MAX} caractères max).`,
      { code: 'REASON_TOO_LONG' }
    );
  }

  const result = await withInternalError(
    ctx,
    '[/api/admin/matches/[matchId]/checkin-staff] error',
    () => staffCheckInTeam(ctx.tenantId, matchId, side)
  );

  if (!result.ok) {
    throw new LegacyAdminError(STATUS_BY_CODE[result.code], result.error, {
      code: result.code,
    });
  }

  return {
    result: {
      success: true,
      matchId,
      teamSide: side,
      checkedInAt: result.checkedInAt,
      alreadyCheckedIn: result.alreadyCheckedIn,
    },
    audit: {
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: result.tournamentId,
      payload: {
        team_side: side,
        team_id: result.teamId,
        reason,
        checked_in_at: result.checkedInAt,
        by_staff: true,
      },
      // Rejeu sur une équipe déjà pointée : rien n'a changé, rien à tracer.
      skip: result.alreadyCheckedIn,
    },
  };
}
