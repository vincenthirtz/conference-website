// features/admin/tournaments/routes/teams.ts — …/[id]/teams
// GET : équipes inscrites ; POST : inscrire une équipe (clôt sa candidature,
// publie une actualité).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TournamentTeamAddBody, TournamentTeamsQuery } from '../schemas';
import { addEntry, listEntries } from '../service/teams';

export default defineAdminRoute({
  key: 'admin-tournament-teams',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentTeamsQuery,
    handler: ({ query, ctx }) => listEntries(ctx, query.id),
  }),
  POST: mutate({
    query: TournamentTeamsQuery,
    body: TournamentTeamAddBody,
    status: 201,
    audit: 'manage_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, addEntry(ctx, query.id, body)),
  }),
});
