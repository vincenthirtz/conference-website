// features/admin/matches/service/mvp.ts — MVP d'un match côté staff :
// état du sondage + candidates, import manuel de la gagnante, effacement.
// Le scrutin du public (…/mvp-public) vit dans service/mvpPublic.ts.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isValidUUID } from '@/utils/apiHelpers';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/mvp';
import { withInternalError } from './internal';

type Raw = Record<string, unknown>;

const LABEL = '[admin/matches/mvp] error:';

type MvpMemberRow = {
  id: string;
  team_id: string;
  battle_tag: string | null;
  is_substitute: boolean;
  team: Relation<{ id: string; name: string }>;
};

export async function getMvp(ctx: ServiceContext, matchId: string) {
  return withInternalError(ctx, LABEL, async () => {
    const match = await repo.getMatchForMvp(ctx.db, ctx.tenantId, matchId);
    if (!match) throw new LegacyAdminError(404, 'Match introuvable');

    const poll = await repo.getMvpPoll(ctx.db, ctx.tenantId, matchId);

    const teamIds = [match.team1_id, match.team2_id].filter(
      (x): x is string => !!x
    );
    let candidates: {
      id: string;
      teamId: string;
      teamName: string | null;
      battleTag: string | null;
      isSubstitute: boolean;
    }[] = [];
    if (teamIds.length > 0) {
      const members = (await repo.listMvpCandidateMembers(
        ctx.db,
        ctx.tenantId,
        teamIds
      )) as unknown as MvpMemberRow[];
      candidates = members.map((m) => ({
        id: m.id,
        teamId: m.team_id,
        teamName: oneRelation(m.team)?.name ?? null,
        battleTag: m.battle_tag ?? null,
        isSubstitute: !!m.is_substitute,
      }));
    }

    return {
      matchId,
      matchStatus: match.status,
      poll: poll || null,
      candidates,
    };
  });
}

/** POST — `{ winnerMemberId }` : la joueuse doit jouer dans l'une des deux équipes. */
export async function importMvpWinner(
  ctx: ServiceContext,
  staffAuthUserId: string | null,
  matchId: string,
  body: Raw
): Promise<Audited<{ poll: unknown }>> {
  return withInternalError(ctx, LABEL, async () => {
    const { winnerMemberId } = body;
    if (
      !winnerMemberId ||
      typeof winnerMemberId !== 'string' ||
      !isValidUUID(winnerMemberId)
    ) {
      throw new LegacyAdminError(400, 'winnerMemberId invalide');
    }

    const match = await repo.getMatchForMvp(ctx.db, ctx.tenantId, matchId);
    if (!match) throw new LegacyAdminError(404, 'Match introuvable');

    const member = await repo.getTeamMember(
      ctx.db,
      ctx.tenantId,
      winnerMemberId
    );
    if (!member) throw new LegacyAdminError(404, 'Joueuse introuvable');
    if (
      member.team_id !== match.team1_id &&
      member.team_id !== match.team2_id
    ) {
      throw new LegacyAdminError(
        400,
        "La joueuse ne fait pas partie d'une des deux équipes du match"
      );
    }

    const now = new Date().toISOString();
    const update = {
      winner_member_id: winnerMemberId,
      winner_battle_tag: member.battle_tag ?? null,
      winner_imported_at: now,
      winner_imported_by: staffAuthUserId,
      updated_at: now,
    };

    // Ligne déjà postée par l'auto-post, ou aucune (pas de webhook Discord).
    const existing = await repo.getMvpPollId(ctx.db, ctx.tenantId, matchId);
    const { row, error } = existing?.id
      ? await repo.updateMvpPollById(ctx.db, ctx.tenantId, existing.id, update)
      : await repo.insertMvpPoll(ctx.db, {
          tenant_id: ctx.tenantId,
          match_id: matchId,
          ...update,
        });
    if (error) {
      ctx.logger.error(
        `[admin/matches/mvp] ${existing?.id ? 'update' : 'insert'} error:`,
        error
      );
      throw new LegacyAdminError(500, "Échec de l'enregistrement");
    }

    return {
      result: { poll: row },
      audit: {
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id ?? null,
        payload: {
          winner_member_id: winnerMemberId,
          winner_battle_tag: member.battle_tag,
        },
      },
    };
  });
}

/** DELETE — efface la gagnante importée. */
export async function clearMvpWinner(
  ctx: ServiceContext,
  matchId: string
): Promise<Audited<{ poll: unknown }>> {
  return withInternalError(ctx, LABEL, async () => {
    const { row, error } = await repo.updateMvpPollByMatch(
      ctx.db,
      ctx.tenantId,
      matchId,
      {
        winner_member_id: null,
        winner_battle_tag: null,
        winner_imported_at: null,
        winner_imported_by: null,
        updated_at: new Date().toISOString(),
      }
    );
    if (error) {
      ctx.logger.error('[admin/matches/mvp] clear error:', error);
      throw new LegacyAdminError(500, 'Échec');
    }
    return {
      result: { poll: row },
      audit: {
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: null,
        payload: { cleared: true },
      },
    };
  });
}
