// features/admin/matches/routes/draftAutoPick.ts — POST /api/admin/matches/[matchId]/drafts/[gameIndex]/auto-pick
// Déclenchement manuel de l'auto-pick (échéance dépassée).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { MatchDraftQuery } from '../schemas';
import { autoPickMatchDraft } from '../service/drafts';

export default defineAdminRoute({
  key: 'match-draft-auto-pick',
  guard: { permission: 'arbitrate_matches' },
  POST: mutate({
    query: MatchDraftQuery,
    // Aucun journal staff à l'origine.
    audit: false,
    handler: ({ query, ctx }) =>
      autoPickMatchDraft(ctx, {
        matchId: query.matchId,
        gameIndex: query.gameIndex,
      }),
  }),
});
