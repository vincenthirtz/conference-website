// features/admin/stages/routes/groups.ts — /api/admin/stages/[stageId]/groups
// GET : poules et équipes non assignées ; PUT : assignations en lot ;
// POST : distribution automatique (serpentin / aléatoire).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageGroupsBody, StageIdQuery } from '../schemas';
import { distributeGroups, getGroups, saveGroups } from '../service/groups';

export default defineAdminRoute({
  key: 'stage-groups',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: StageIdQuery,
    handler: ({ query, ctx }) => getGroups(ctx, query.stageId),
  }),
  PUT: mutate({
    query: StageIdQuery,
    body: StageGroupsBody,
    audit: 'update_group_assignments',
    handler: ({ query, body, ctx }) =>
      audited(ctx, saveGroups(ctx, query.stageId, body)),
  }),
  POST: mutate({
    query: StageIdQuery,
    body: StageGroupsBody,
    audit: 'auto_distribute_groups',
    handler: ({ query, body, ctx }) =>
      audited(ctx, distributeGroups(ctx, query.stageId, body)),
  }),
});
