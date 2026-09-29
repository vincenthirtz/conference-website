// features/admin/tournaments/routes/mvpVotes.ts — GET …/[id]/mvp-votes : suivi du vote MVP des équipes, match par match.
// Lecture seule.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TournamentIdLowerQuery } from '../schemas';
import { teamVotes } from '../service/votes';

export default defineAdminRoute({
  key: 'admin-tournament-mvp-votes',
  // Même seuil que la route MVP d'un match : les casters suivent le vote en
  // direct depuis la régie.
  guard: 'caster',
  GET: read({
    query: TournamentIdLowerQuery,
    // En-tête d'origine (suivi en direct, jamais mis en cache).
    cache: 'no-store',
    handler: ({ query, ctx }) => teamVotes(ctx, query.id),
  }),
});
