// GET /api/player/data-export — droit d'accès RGPD (lot P9).
//
// Registre `utils/player/personalDataTables.ts` (le même que la suppression),
// tous tenants. Téléchargé en `mes-donnees.json`. `subject: 'self'` strict :
// jamais d'export d'un tiers, inspection comprise.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { buildDataExport } from '../service';

export default defineSubjectRoute({
  key: 'player-data-export',
  GET: readSubject({
    rateLimit: { max: 5, windowMs: 60_000 },
    cache: false,
    handler: async ({ ctx, res }) => {
      const exportData = await buildDataExport(ctx.user);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="mes-donnees.json"'
      );
      return exportData;
    },
  }),
});
