// features/admin/tournaments/routes/mvpPublicVotes.ts — GET …/[id]/mvp-public-votes : suivi du vote MVP du PUBLIC (Twitch + Discord).
// Lecture seule.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TournamentIdLowerQuery } from '../schemas';
import { publicVotes } from '../service/votes';

export default defineAdminRoute({
  key: 'admin-tournament-mvp-public-votes',
  // Même seuil que la route MVP d'un match : les casters suivent le vote en
  // direct depuis la régie.
  guard: 'caster',
  GET: read({
    query: TournamentIdLowerQuery,
    // En-tête d'origine (suivi en direct, jamais mis en cache).
    cache: 'no-store',
    handler: ({ query, ctx }) => publicVotes(ctx, query.id),
  }),
});
