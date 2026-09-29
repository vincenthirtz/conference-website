// features/admin/teams/routes/index.ts — GET /api/admin/teams
// Liste paginée des équipes de l'espace (filtres partagés avec l'export).

import { parsePagination } from '@/utils/apiHelpers';
import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TeamListQuery } from '../schemas';
import { listTeams } from '../service/teams';

export default defineAdminRoute({
  key: 'admin-teams',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: TeamListQuery,
    handler: ({ query, ctx, req }) =>
      listTeams(ctx, query, parsePagination(req, { limit: 50 })),
  }),
});
