// POST /api/player/scrims/{scrimId}/report — une équipe rapporte le score
// d'un de ses scrims (réconciliation à deux voix, cf. service). Droit :
// `manage_scrims`. Sujet `self`. Idempotence honorée si le client envoie une
// `Idempotency-Key` (double tap = une écriture).

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { ScrimIdQuery } from '../schemas';
import { reportScrimScore } from '../service/report';

export default defineSubjectRoute({
  key: 'scrim-report',
  tenantResolution: 'async',
  POST: mutateSubject({
    team: { permission: 'manage_scrims' },
    query: ScrimIdQuery,
    rateLimit: { max: 20, windowMs: 60_000 },
    // Corps validé par le service : message et code historiques.
    handler: ({ ctx, query, req }) =>
      reportScrimScore(
        { ...ctx, userId: ctx.subject.userId },
        query.scrimId,
        req.body
      ),
  }),
});
