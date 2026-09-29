// features/admin/matches/routes/draftById.ts — /api/admin/matches/[matchId]/drafts/[gameIndex]
// GET : état assemblé du draft ; DELETE : supprime draft + étapes
// (`?force=1` pour un draft en cours).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { MatchDraftQuery } from '../schemas';
import { deleteMatchDraft, getMatchDraft } from '../service/drafts';

export default defineAdminRoute({
  key: 'match-draft',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchDraftQuery,
    handler: ({ query, ctx }) =>
      getMatchDraft(ctx, {
        matchId: query.matchId,
        gameIndex: query.gameIndex,
      }),
  }),
  DELETE: mutate({
    query: MatchDraftQuery,
    // Aucun journal staff à l'origine.
    audit: false,
    handler: ({ query, ctx }) =>
      deleteMatchDraft(
        ctx,
        { matchId: query.matchId, gameIndex: query.gameIndex },
        query.force === '1' || query.force === 'true'
      ),
  }),
});
