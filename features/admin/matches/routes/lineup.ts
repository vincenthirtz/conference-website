// features/admin/matches/routes/lineup.ts — /api/admin/matches/[matchId]/lineup
// Feuille de match côté organisation. GET : les deux feuilles ; POST :
// valide (ou rouvre) la feuille d'une équipe à sa place.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MatchLineupBody, MatchLineupQuery } from '../schemas';
import { actOnLineup, getLineups } from '../service/lineup';

/** Plafond d'origine (60/min, lecture comme écriture). */
const LINEUP_RATE_LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-lineup',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchLineupQuery,
    rateLimit: LINEUP_RATE_LIMIT,
    handler: ({ query, ctx }) => getLineups(ctx, query.matchId),
  }),
  POST: mutate({
    query: MatchLineupQuery,
    body: MatchLineupBody,
    rateLimit: LINEUP_RATE_LIMIT,
    // `validate_match_lineup` ou `reopen_match_lineup` : précisé par le service.
    audit: 'validate_match_lineup',
    handler: ({ query, body, ctx }) =>
      audited(ctx, actOnLineup(ctx, ctx.staff.user.id, query.matchId, body)),
  }),
});
