// features/admin/stages/routes/participationReward.ts —
// /api/admin/stages/[stageId]/participation-reward
// POST `{ team_id }` : récompense TCG de participation d'une équipe déjà en
// DNF (rattrapage, rejouable sans doublon).
// Contrat : features/admin/stages/client.ts (ParticipationRewardResponse).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ParticipationRewardBody, StageIdQuery } from '../schemas';
import { grantStageTeamParticipationReward } from '../service/participationReward';

export default defineAdminRoute({
  key: 'stage-participation-reward',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: ParticipationRewardBody,
    audit: 'grant_participation_reward',
    handler: ({ query, body, ctx }) =>
      audited(
        ctx,
        grantStageTeamParticipationReward(ctx, query.stageId, body.team_id)
      ),
  }),
});
