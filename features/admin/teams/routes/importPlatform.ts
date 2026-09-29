// features/admin/teams/routes/importPlatform.ts — POST /api/admin/teams/import-platform
// Import d'équipes depuis Toornament / Challonge / start.gg (5 req/min).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { TeamImportPlatformBody } from '../schemas';
import { importTeamsFromPlatform } from '../service/imports';

export default defineAdminRoute({
  key: 'admin-teams-import-platform',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    body: TeamImportPlatformBody,
    rateLimit: { max: 5, windowMs: 60_000 },
    // Journal écrit par `importTeams` (utils/teamImport), comme à l'origine.
    audit: false,
    handler: ({ body, ctx }) => importTeamsFromPlatform(ctx, body),
  }),
});
