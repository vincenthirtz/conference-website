// features/admin/stages/routes/batchScores.ts — POST /api/admin/stages/[stageId]/batch-scores
// Scores de plusieurs matchs en un appel. Tous en échec → 500 avec le détail
// (corps historique, sans `error`) : la route l'écrit elle-même.

import {
  defineAdminRoute,
  mutate,
  RESPONSE_SENT,
} from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageBatchScoresBody, StageIdQuery } from '../schemas';
import { batchScores } from '../service/matchOps';

export default defineAdminRoute({
  key: 'stage-batch-scores',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageBatchScoresBody,
    audit: 'staff_batch_action',
    handler: async ({ query, body, ctx, res }) => {
      const out = await audited(ctx, batchScores(ctx, query.stageId, body));
      if (out.httpStatus === 200) return out.body;
      res.status(out.httpStatus).json(out.body);
      return RESPONSE_SENT;
    },
  }),
});
