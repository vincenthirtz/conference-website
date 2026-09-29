// features/admin/matches/routes/draftStart.ts — POST /api/admin/matches/[matchId]/drafts/[gameIndex]/start
// Démarre un draft (pending → in_progress) et arme le minuteur serveur.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { MatchDraftQuery } from '../schemas';
import { startMatchDraft } from '../service/drafts';

export default defineAdminRoute({
  key: 'match-draft-start',
  guard: { permission: 'arbitrate_matches' },
  POST: mutate({
    query: MatchDraftQuery,
    // Aucun journal staff à l'origine.
    audit: false,
    handler: ({ query, ctx }) =>
      startMatchDraft(ctx, {
        matchId: query.matchId,
        gameIndex: query.gameIndex,
      }),
  }),
});
