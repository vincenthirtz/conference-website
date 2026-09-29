// features/admin/tournaments/routes/prizePool.ts — /api/admin/tournaments/[id]/prize-pool
// GET : cagnotte + contributions ; PUT / POST : crée (201) ou met à jour
// (200) la cagnotte du tournoi. Ouvrir exige le compte HelloAsso de l'espace.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CodedTournamentIdQuery, PrizePoolLooseBody } from '../schemas';
import { getPrizePool, upsertPrizePool } from '../service/prizePool';
import { respond } from './respond';

// POST est un alias historique de PUT.
const upsert = mutate({
  query: CodedTournamentIdQuery,
  body: PrizePoolLooseBody,
  // Slug de la méthode ; la création se journalise `create_prize_pool`.
  audit: 'update_prize_pool',
  handler: async ({ query, body, ctx, res }) =>
    respond(res, await audited(ctx, upsertPrizePool(ctx, query.id, body))),
});

export default defineAdminRoute({
  key: 'admin-tournament-prize-pool',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: CodedTournamentIdQuery,
    handler: ({ query, ctx }) => getPrizePool(ctx, query.id),
  }),
  PUT: upsert,
  POST: upsert,
});
