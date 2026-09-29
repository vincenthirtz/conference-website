// features/admin/matches/routes/drafts.ts — POST /api/admin/matches/[matchId]/drafts
// Initialise le draft MOBA d'une partie (409 s'il existe déjà).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { DraftInitBody, MatchIdQuery } from '../schemas';
import { initMatchDraft } from '../service/drafts';

export default defineAdminRoute({
  key: 'match-draft-init',
  guard: { permission: 'arbitrate_matches' },
  POST: mutate({
    query: MatchIdQuery,
    body: DraftInitBody,
    status: 201,
    // Aucun journal staff à l'origine : le draft trace ses propres étapes.
    audit: false,
    handler: ({ query, body, ctx }) => initMatchDraft(ctx, query.matchId, body),
  }),
});
