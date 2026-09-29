// features/admin/tournaments/routes/bulkMatches.ts — POST …/[id]/bulk-matches
// mode = shift_round (décale un tour) | reassign_stage (change de phase).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { BulkMatchesBody, TournamentIdLowerQuery } from '../schemas';
import { runBulkMatches } from '../service/bulk';

export default defineAdminRoute({
  key: 'admin-tournament-bulk-matches',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: TournamentIdLowerQuery,
    body: BulkMatchesBody,
    audit: 'staff_batch_action',
    handler: ({ query, body, ctx }) =>
      audited(ctx, runBulkMatches(ctx, query.id, body)),
  }),
});
