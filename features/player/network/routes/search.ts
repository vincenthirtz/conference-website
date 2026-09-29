// GET /api/player/discovery/search — annuaire des joueuses DÉCOUVRABLES du
// réseau (cross-tenant), DERRIÈRE LE LOGIN (lot P15). Il n'existe AUCUNE
// variante publique ni indexable (arbitrage produit du 2026-07-13).
// `subject: 'self'` : `?as=` → 403 (l'annuaire n'est pas inspectable).

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { searchDirectory } from '../service';

export default defineSubjectRoute({
  key: 'player-discovery-search',
  GET: readSubject({
    subject: 'self',
    rateLimit: { max: 60, windowMs: 60_000 },
    cache: 'no-store',
    // Query validée par le service : code historique `INVALID_QUERY`.
    handler: ({ ctx, req }) =>
      searchDirectory({ ...ctx, userId: ctx.subject.userId }, req.query),
  }),
});
