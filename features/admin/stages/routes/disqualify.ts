// features/admin/stages/routes/disqualify.ts —
// /api/admin/stages/[stageId]/disqualify
// POST : disqualifier une équipe (`{ team_id, mode, reason }`) ;
// DELETE : la réintégrer (`?team_id=` ou `{ team_id }`).
// Contrat : features/admin/stages/client.ts (DisqualifyTeamResponse…).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  DisqualifyTeamBody,
  ReinstateTeamBody,
  ReinstateTeamQuery,
  StageIdQuery,
} from '../schemas';
import { disqualifyStageTeam, reinstateStageTeam } from '../service/disqualify';

export default defineAdminRoute({
  key: 'stage-disqualify',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: DisqualifyTeamBody,
    audit: 'disqualify_team',
    status: 201,
    handler: ({ query, body, ctx }) =>
      audited(
        ctx,
        disqualifyStageTeam(ctx, query.stageId, {
          teamId: body.team_id,
          mode: body.mode,
          reason: body.reason,
        })
      ),
  }),
  DELETE: mutate({
    query: ReinstateTeamQuery,
    body: ReinstateTeamBody,
    audit: 'reinstate_team',
    handler: ({ query, body, ctx }) =>
      audited(
        ctx,
        reinstateStageTeam(ctx, query.stageId, query.team_id ?? body.team_id)
      ),
  }),
});
