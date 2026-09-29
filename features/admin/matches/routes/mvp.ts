// features/admin/matches/routes/mvp.ts — /api/admin/matches/[matchId]/mvp
// GET : sondage + candidates ; POST : importe la gagnante ; DELETE : l'efface.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MatchIdQuery, MvpImportBody } from '../schemas';
import { clearMvpWinner, getMvp, importMvpWinner } from '../service/mvp';

export default defineAdminRoute({
  key: 'admin-match-mvp',
  guard: 'caster',
  GET: read({
    query: MatchIdQuery,
    handler: ({ query, ctx }) => getMvp(ctx, query.matchId),
  }),
  POST: mutate({
    query: MatchIdQuery,
    body: MvpImportBody,
    audit: 'import_mvp',
    handler: ({ query, body, ctx }) =>
      audited(
        ctx,
        importMvpWinner(
          ctx,
          ctx.staff.staff.auth_user_id ?? null,
          query.matchId,
          body
        )
      ),
  }),
  DELETE: mutate({
    query: MatchIdQuery,
    audit: 'import_mvp',
    handler: ({ query, ctx }) =>
      audited(ctx, clearMvpWinner(ctx, query.matchId)),
  }),
});
