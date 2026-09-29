// features/admin/matches/service/checkinNudge.ts — relance manuelle du
// check-in (console live) : un événement outbox `checkin.nudge` par équipe
// à relancer, que le bot transforme en DM au(x) capitaine(s) avec un lien
// de check-in neuf. Une équipe déjà check-in n'est jamais relancée.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { buildCheckinUrl, generateCheckinToken } from '@/utils/checkin';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/reads';
import { withInternalError } from './internal';

type TeamSide = 1 | 2 | 'both';

export async function nudgeCheckin(
  ctx: ServiceContext,
  matchId: string,
  body: Record<string, unknown>
): Promise<
  Audited<{
    success: true;
    matchId: string;
    nudgedSides: number[];
    skippedSides: (1 | 2)[];
  }>
> {
  const sideRaw = body.teamSide;
  if (sideRaw !== 1 && sideRaw !== 2 && sideRaw !== 'both') {
    throw new LegacyAdminError(400, 'teamSide must be 1, 2 or "both"');
  }
  const teamSide: TeamSide = sideRaw;
  const staffId = ctx.actor.kind === 'staff' ? ctx.actor.staffId : null;

  return withInternalError(
    ctx,
    '[/api/admin/matches/[matchId]/checkin-nudge] error',
    async () => {
      const match = await repo.getMatchForNudge(ctx.db, ctx.tenantId, matchId);
      if (!match) throw new LegacyAdminError(404, 'Match not found');

      if (match.status !== 'pending' && match.status !== 'ongoing') {
        throw new LegacyAdminError(
          409,
          `Cannot nudge a match in status '${match.status}'. Must be 'pending' or 'ongoing'.`,
          { code: 'INVALID_STATUS' }
        );
      }

      // 'both' ne relance que les équipes qui n'ont pas coché.
      const requested: (1 | 2)[] = teamSide === 'both' ? [1, 2] : [teamSide];
      const sidesToNudge = requested.filter(
        (s) =>
          !(s === 1 ? match.team1_checked_in_at : match.team2_checked_in_at)
      );
      if (sidesToNudge.length === 0) {
        throw new LegacyAdminError(
          409,
          'Aucune équipe à relancer (déjà check-in).',
          { code: 'ALREADY_CHECKED_IN' }
        );
      }

      // Jetons posés par le cron à T-60 ; une relance plus tôt les crée.
      let team1Token: string | null = match.team1_checkin_token ?? null;
      let team2Token: string | null = match.team2_checkin_token ?? null;
      const tokenUpdates: {
        team1_checkin_token?: string;
        team2_checkin_token?: string;
      } = {};
      if (sidesToNudge.includes(1) && !team1Token) {
        team1Token = generateCheckinToken();
        tokenUpdates.team1_checkin_token = team1Token;
      }
      if (sidesToNudge.includes(2) && !team2Token) {
        team2Token = generateCheckinToken();
        tokenUpdates.team2_checkin_token = team2Token;
      }
      if (Object.keys(tokenUpdates).length > 0) {
        const { error: tokErr } = await repo.setCheckinTokens(
          ctx.db,
          ctx.tenantId,
          matchId,
          tokenUpdates
        );
        if (tokErr) {
          ctx.logger.error('[checkin-nudge] token backfill error', tokErr);
        }
      }

      const enriched = await enrichMatchEvent(matchId).catch(() => null);

      // Un événement par équipe : le bot route chaque DM indépendamment.
      const emitted: number[] = [];
      for (const side of sidesToNudge) {
        const token = side === 1 ? team1Token : team2Token;
        try {
          await emitBotEvent(
            'checkin.nudge',
            {
              matchId,
              tournamentId: match.tournament_id ?? null,
              teamSide: side,
              scheduledAt: match.scheduled_at ?? null,
              nudgedByStaffId: staffId,
              checkinUrl: token ? buildCheckinUrl(token) : null,
              enriched,
            },
            ctx.tenantId
          );
          emitted.push(side);
        } catch (e) {
          ctx.logger.error(
            '[checkin-nudge] emitBotEvent error matchId=%s side=%d',
            matchId,
            side,
            e
          );
        }
      }

      if (emitted.length === 0) {
        throw new LegacyAdminError(500, 'Failed to emit any nudge event');
      }

      return {
        result: {
          success: true,
          matchId,
          nudgedSides: emitted,
          skippedSides: requested.filter((s) => !emitted.includes(s)),
        },
        audit: {
          entity_type: 'match',
          entity_id: matchId,
          tournament_id: match.tournament_id ?? null,
          payload: { team_sides: emitted },
        },
      };
    }
  );
}
