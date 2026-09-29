// features/admin/stages/routes/autoByes.ts — POST /api/admin/stages/[stageId]/auto-byes
// Les matchs à une seule équipe deviennent des BYE terminés (propagés).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageAutoByesBody, StageIdQuery } from '../schemas';
import { autoByes } from '../service/matchOps';

export default defineAdminRoute({
  key: 'stage-auto-byes',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageAutoByesBody,
    audit: 'staff_batch_action',
    handler: ({ query, body, ctx }) =>
      audited(ctx, autoByes(ctx, query.stageId, body)),
  }),
});
