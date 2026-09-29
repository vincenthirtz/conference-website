// features/admin/tournaments/routes/overlayDay.ts — …/[id]/overlay-day
// Jour FORCÉ de la source OBS « Matchs du jour » : GET l'état, PUT le pose
// (`AAAA-MM-JJ`) ou le retire (`null`). Expire seul au bout de 12 h.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { OverlayDayBody, TournamentIdLowerQuery } from '../schemas';
import { getOverlayDay, setOverlayDay } from '../service/structure';

export default defineAdminRoute({
  key: 'admin-tournament-overlay-day',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentIdLowerQuery,
    handler: ({ query, ctx }) => getOverlayDay(ctx, query.id),
  }),
  PUT: mutate({
    query: TournamentIdLowerQuery,
    body: OverlayDayBody,
    audit: 'update_tournament',
    handler: ({ query, body, ctx }) =>
      audited(ctx, setOverlayDay(ctx, query.id, body)),
  }),
});
