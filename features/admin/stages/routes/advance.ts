// features/admin/stages/routes/advance.ts — POST /api/admin/stages/[stageId]/advance
// Avance des équipes vers une autre phase (manuel, ou auto depuis
// `settings.advancement_rules`). Rejeu idempotent : la modale envoie une clé.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageAdvanceBody, StageIdQuery } from '../schemas';
import { advanceTeams } from '../service/advance';

export default defineAdminRoute({
  key: 'admin-stage-advance',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageAdvanceBody,
    audit: 'advance_teams',
    handler: ({ query, body, ctx }) =>
      audited(ctx, advanceTeams(ctx, query.stageId, body)),
  }),
});
