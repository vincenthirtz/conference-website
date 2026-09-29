// features/admin/teams/routes/importCsv.ts — POST /api/admin/teams/import-csv
// Import d'équipes depuis un CSV brut. `importTeams` journalise lui-même.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { TeamImportCsvBody } from '../schemas';
import { importTeamsFromCsv } from '../service/imports';

export default defineAdminRoute({
  key: 'admin-teams-import-csv',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    body: TeamImportCsvBody,
    // Journal écrit par `importTeams` (utils/teamImport), comme à l'origine.
    audit: false,
    handler: ({ body, ctx }) => importTeamsFromCsv(ctx, body),
  }),
});
