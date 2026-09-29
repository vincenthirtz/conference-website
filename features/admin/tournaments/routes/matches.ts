// features/admin/tournaments/routes/matches.ts — …/[id]/matches
// GET : liste filtrée + pagination (`{ matches }` toujours ; `stages`,
// `total`, `tournament` sur demande) ; POST : création de 1..N matchs.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import {
  TournamentMatchesCreateBody,
  TournamentMatchesQuery,
} from '../schemas';
import { createMatches, listMatches } from '../service/matches';

export default defineAdminRoute({
  key: 'admin-tournament-matches',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: TournamentMatchesQuery,
    handler: ({ query, req, ctx }) =>
      listMatches(
        ctx,
        query.id,
        query,
        parsePagination(req, { limit: 200, maxLimit: 512 })
      ),
  }),
  POST: mutate({
    query: TournamentMatchesQuery,
    body: TournamentMatchesCreateBody,
    status: 201,
    audit: 'create_match',
    handler: ({ query, body, ctx }) =>
      audited(ctx, createMatches(ctx, query.id, body)),
  }),
});
