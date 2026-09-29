// features/admin/matches/routes/draftSide.ts — PATCH /api/admin/matches/[matchId]/drafts/[gameIndex]/side
// Côtés des deux équipes, avant la première étape.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { DraftSideBody, MatchDraftQuery } from '../schemas';
import { setMatchDraftSides } from '../service/drafts';

export default defineAdminRoute({
  key: 'match-draft-side',
  guard: { permission: 'arbitrate_matches' },
  PATCH: mutate({
    query: MatchDraftQuery,
    body: DraftSideBody,
    // Aucun journal staff à l'origine.
    audit: false,
    handler: ({ query, body, ctx }) =>
      setMatchDraftSides(
        ctx,
        { matchId: query.matchId, gameIndex: query.gameIndex },
        body
      ),
  }),
});
