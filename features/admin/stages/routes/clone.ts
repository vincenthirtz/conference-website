// features/admin/stages/routes/clone.ts — POST /api/admin/stages/[stageId]/clone
// Copie d'une phase (désactivée), de ses inscriptions et, sur demande, de ses
// matchs (liens de bracket recâblés).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageCloneBody, StageIdQuery } from '../schemas';
import { cloneStage } from '../service/stage';

export default defineAdminRoute({
  key: 'stage-clone',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageCloneBody,
    audit: 'clone_stage',
    status: 201,
    handler: ({ query, body, ctx }) =>
      audited(ctx, cloneStage(ctx, query.stageId, body)),
  }),
});
