// GET /api/teams/search-players — recherche de joueuses à ajouter (lot P10,
// même contrat). `manage_roster` ; suit l'inspection staff (le cockpit
// /admin/teams/my cherche avec les droits de la capitaine, `view_captain_data`).
// Limiteur durable cross-instance en plus du plafond mémoire (fail-open).

import {
  defineSubjectRoute,
  readSubject,
  RESPONSE_SENT,
} from '@/utils/player/defineSubjectRoute';
import {
  clientKeyFromReq,
  consumeDurableRateLimit,
} from '@/utils/durableRateLimit';
import { searchPlayers } from '../service/recruiting';

export default defineSubjectRoute({
  key: 'search-players',
  tenantResolution: 'async',
  inspectionAudit: 'view_captain_data',
  GET: readSubject({
    subject: 'follow',
    team: { permission: 'manage_roster' },
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: async ({ ctx, req, res }) => {
      const allowed = await consumeDurableRateLimit(
        `searchplayers:${clientKeyFromReq(req)}`,
        60,
        30
      );
      if (!allowed) {
        res.setHeader('Retry-After', '60');
        res
          .status(429)
          .json({ error: 'Trop de requêtes. Réessayez plus tard.' });
        return RESPONSE_SENT;
      }
      return searchPlayers(ctx, req.query.q);
    },
  }),
});
