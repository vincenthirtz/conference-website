// features/admin/tournaments/routes/checkinNudgeAll.ts — POST
// …/[id]/checkin-nudge-all : relance CHAQUE côté non checké des matchs
// imminents (lot A1). Anti-double-clic : l'idempotence du wrapper.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TournamentIdQuery } from '../schemas';
import { nudgeAllMissing } from '../service/ops';

export default defineAdminRoute({
  key: 'admin-tournament-checkin-nudge-all',
  // Lot A2 : tenir le check-in est une TÂCHE, pas le back-office entier.
  guard: { permission: 'run_checkin' },
  POST: mutate({
    query: TournamentIdQuery,
    audit: 'checkin_manual_nudge',
    handler: ({ query, ctx }) => audited(ctx, nudgeAllMissing(ctx, query.id)),
  }),
});
