// features/admin/matches/routes/draftCommit.ts — POST /api/admin/matches/[matchId]/drafts/[gameIndex]/commit
// Valide une étape ban/pick (règles : utils/draftEngine).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { DraftCommitBody, MatchDraftQuery } from '../schemas';
import { commitMatchDraftStep } from '../service/drafts';

export default defineAdminRoute({
  key: 'match-draft-commit',
  guard: { permission: 'arbitrate_matches' },
  POST: mutate({
    query: MatchDraftQuery,
    body: DraftCommitBody,
    // Aucun journal staff à l'origine.
    audit: false,
    handler: ({ query, body, ctx }) =>
      commitMatchDraftStep(
        ctx,
        { matchId: query.matchId, gameIndex: query.gameIndex },
        body
      ),
  }),
});
