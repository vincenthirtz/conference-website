// features/admin/matches/routes/byId.ts — /api/admin/matches/[matchId]
// GET : fiche (+ `?includeGames=1`) ; PATCH / PUT : score (propagation
// bracket) ou méta-données ; DELETE : annulation, ou suppression `?hard=1`.
// Règles et effets de bord : service/match.ts.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { revalidateMatchPages } from '@/utils/matches/revalidateMatchPages';
import { audited } from '../../_shared/audited';
import { MatchByIdQuery, MatchUpdateBody } from '../schemas';
import { deleteMatch, getMatch, updateMatch } from '../service/match';

const isOn = (v: unknown) => v === '1' || v === 'true';

// PUT est un alias historique de PATCH (même corps, mêmes règles).
// Idempotency-Key : un rejeu du score (ScoreEntryModal) rejoue la réponse au
// lieu de re-propager le bracket.
const update = mutate({
  query: MatchByIdQuery,
  body: MatchUpdateBody,
  audit: 'update_match',
  handler: ({ query, body, ctx, res }) =>
    audited(
      ctx,
      updateMatch(ctx, query.matchId, body, {
        afterScore: () =>
          revalidateMatchPages(res, {
            tenantId: ctx.tenantId,
            matchId: query.matchId,
          }),
      })
    ),
});

export default defineAdminRoute({
  key: 'admin-match-update',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchByIdQuery,
    handler: ({ query, ctx }) =>
      getMatch(ctx, query.matchId, isOn(query.includeGames)),
  }),
  PATCH: update,
  PUT: update,
  DELETE: mutate({
    query: MatchByIdQuery,
    // `delete_match` (suppression) ou `update_match` (annulation) : le
    // service précise l'action.
    audit: 'delete_match',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteMatch(ctx, query.matchId, isOn(query.hard))),
  }),
});
