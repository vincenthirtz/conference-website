// features/admin/teams/routes/bulk.ts — POST /api/admin/teams/bulk
// delete / activate / deactivate / assign sur une sélection d'équipes.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TeamBulkBody } from '../schemas';
import { bulkTeams } from '../service/teams';

export default defineAdminRoute({
  key: 'admin-teams-bulk',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    body: TeamBulkBody,
    audit: 'staff_batch_action',
    handler: ({ body, ctx }) => audited(ctx, bulkTeams(ctx, body)),
  }),
});
