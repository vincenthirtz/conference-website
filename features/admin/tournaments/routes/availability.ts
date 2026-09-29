// features/admin/tournaments/routes/availability.ts — GET …/[id]/availability
// Contraintes de disponibilité des équipes engagées (lot 2) : celles du
// tournoi ET les globales. Lecture seule.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { CodedTournamentIdQuery } from '../schemas';
import { codedTournamentId } from '../service/common';
import { availability } from '../service/schedule';

export default defineAdminRoute({
  key: 'admin-tournament-availability',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: CodedTournamentIdQuery,
    handler: ({ query, ctx }) =>
      availability(
        ctx,
        codedTournamentId(
          query.id,
          'Invalid tournament id',
          'INVALID_TOURNAMENT_ID'
        )
      ),
  }),
});
