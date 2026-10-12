// features/admin/stages/service/participationReward.ts — verser (ou
// re-verser, sans doublon) la récompense TCG de participation d'une équipe
// DÉJÀ disqualifiée (DNF) de la phase.
//
// La disqualification déclenche la même règle d'elle-même
// (`disqualify.ts`). Cette action sert au RATTRAPAGE : équipe disqualifiée
// avant que la règle existe (Éclypse, 2026-10-08), migration
// `tcg_tournament_participation_reward.sql` passée après coup, panne au moment
// du DNF. Rejouer est sûr : `utils/tcg/grantTournamentParticipation.ts` ne
// recrédite personne et ne reposte pas le message.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import { grantTournamentParticipation } from '@/utils/tcg/grantTournamentParticipation';
import type { Audited } from '../../_shared/audited';
import type { ParticipationRewardResponse } from '../client';
import * as stages from '../repository/stages';
import { fail } from './common';

export async function grantStageTeamParticipationReward(
  ctx: ServiceContext,
  stageId: string,
  teamId: string
): Promise<Audited<ParticipationRewardResponse>> {
  const { row: stage } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (!stage) throw fail(404, 'Stage introuvable.');

  const { row, error } = await stages.stageTeamDisqualification(
    ctx.db,
    ctx.tenantId,
    stageId,
    teamId
  );
  if (error) {
    ctx.logger.error('[participation-reward] lecture inscription', error);
    throw fail(500, "Lecture de l'inscription impossible.");
  }
  if (!row) {
    throw fail(
      404,
      "Cette équipe n'est pas inscrite à la phase.",
      'TEAM_NOT_IN_STAGE'
    );
  }
  if (!row.disqualified_at) {
    throw fail(
      409,
      "Cette équipe n'est pas disqualifiée de la phase.",
      'NOT_DISQUALIFIED'
    );
  }
  const team = oneRelation(
    row.team as Relation<{ id: string; name: string | null }>
  );

  const reward = await grantTournamentParticipation({
    tenantId: ctx.tenantId,
    tournamentId: stage.tournament_id,
    teamId,
    source: 'admin',
  });
  if (reward.status === 'error' || reward.status === 'not_ready') {
    throw fail(
      503,
      reward.status === 'not_ready'
        ? 'Récompense de participation indisponible (registre TCG).'
        : 'Récompense de participation impossible (migration tcg_tournament_participation_reward.sql appliquée ?).',
      'PARTICIPATION_REWARD_FAILED'
    );
  }

  const result: ParticipationRewardResponse = {
    ...reward,
    teamId,
    teamName: team?.name ?? null,
  };
  return {
    result,
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        team_id: teamId,
        team_name: result.teamName,
        status: reward.status,
        coins: reward.coins,
        eligible: reward.eligible,
        granted: reward.granted,
        roster_source: reward.rosterSource,
        message: reward.message,
      },
    },
  };
}
