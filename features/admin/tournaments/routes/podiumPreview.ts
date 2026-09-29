// features/admin/tournaments/routes/podiumPreview.ts — GET …/[id]/podium-preview : candidats + proposition de classement + palmarès figé.
// Lecture seule.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TournamentIdQuery } from '../schemas';
import { podiumPreview } from '../service/insights';

export default defineAdminRoute({
  key: 'admin-tournament-podium-preview',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentIdQuery,
    handler: ({ query, ctx }) => podiumPreview(ctx, query.id),
  }),
});
