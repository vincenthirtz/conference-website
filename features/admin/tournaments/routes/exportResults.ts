// features/admin/tournaments/routes/exportResults.ts — GET
// …/[id]/export-results?format=csv|json : fichier téléchargé, écrit ici.

import {
  RESPONSE_SENT,
  defineAdminRoute,
  read,
} from '@/utils/admin/defineAdminRoute';
import { ExportResultsQuery } from '../schemas';
import { exportResults } from '../service/export';

export default defineAdminRoute({
  key: 'admin-tournament-export-results',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: ExportResultsQuery,
    handler: async ({ query, ctx, res }) => {
      const file = await exportResults(
        ctx,
        query.id,
        query.format === 'json' ? 'json' : 'csv'
      );
      res.setHeader('Content-Type', file.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.filename}"`
      );
      res.status(200).end(file.content);
      return RESPONSE_SENT;
    },
  }),
});
