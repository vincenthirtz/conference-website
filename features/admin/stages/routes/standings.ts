// features/admin/stages/routes/standings.ts — GET /api/admin/stages/[stageId]/standings
// Classement de la phase ; `?export=csv|json` : téléchargement, écrit ici.

import {
  defineAdminRoute,
  read,
  RESPONSE_SENT,
} from '@/utils/admin/defineAdminRoute';
import { StageStandingsQuery } from '../schemas';
import { stageStandings } from '../service/standings';

export default defineAdminRoute({
  key: 'stage-standings',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: StageStandingsQuery,
    handler: async ({ query, ctx, res }) => {
      const out = await stageStandings(ctx, query.stageId, query.export);
      if ('json' in out) return out.json;
      res.setHeader('Content-Type', out.file.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${out.file.filename}"`
      );
      res.status(200).end(out.file.content);
      return RESPONSE_SENT;
    },
  }),
});
