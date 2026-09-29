// features/admin/scrims/routes/matches.ts — /api/admin/scrims/[scrimId]/matches
// GET : matchs du scrim ; POST : création d'un ou plusieurs matchs (≤ 50).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ScrimIdQuery, ScrimMatchesBody } from '../schemas';
import { createScrimMatches, listScrimMatches } from '../service/scrimMatches';

export default defineAdminRoute({
  key: 'scrim-matches-batch',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: ScrimIdQuery,
    handler: ({ query, ctx }) => listScrimMatches(ctx, query.scrimId),
  }),
  POST: mutate({
    query: ScrimIdQuery,
    body: ScrimMatchesBody,
    status: 201,
    audit: 'create_match',
    handler: ({ query, body, ctx }) =>
      audited(ctx, createScrimMatches(ctx, query.scrimId, body)),
  }),
});
