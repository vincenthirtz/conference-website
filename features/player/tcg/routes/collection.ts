// /api/player/tcg/collection — GET : ma collection, paginée par curseur
// (lot P14). `subject: 'self'` (ex-garde « auth » historique) : `?as=` refusé.
// Réponse `private, no-store` (défaut du noyau) : les faces se relisent à
// chaque appel (retrait de consentement), aucune couche ne doit en garder.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readCollection } from '../service/collection';

export default defineSubjectRoute({
  key: 'player-tcg-collection',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      readCollection(
        {
          tenantId: ctx.tenantId,
          userId: ctx.subject.userId,
          logger: ctx.logger,
        },
        { limit: req.query.limit, cursor: req.query.cursor }
      ),
  }),
});
