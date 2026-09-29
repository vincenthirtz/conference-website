// features/admin/tournaments/routes/scheduleDiagnostics.ts — GET
// …/[id]/schedule-diagnostics?rest=&concurrent=&tz= (lot 3). Lecture seule :
// la correction proposée est un objet de la réponse, jamais une écriture.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { ScheduleDiagnosticsQuery } from '../schemas';
import { codedTournamentId } from '../service/common';
import { diagnose } from '../service/schedule';

export default defineAdminRoute({
  key: 'admin-tournament-schedule-diagnostics',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: ScheduleDiagnosticsQuery,
    handler: ({ query, ctx }) =>
      diagnose(
        ctx,
        codedTournamentId(
          query.id,
          'Invalid tournament id',
          'INVALID_TOURNAMENT_ID'
        ),
        query
      ),
  }),
});
