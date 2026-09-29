// GET/PUT /api/player/discovery — ma carte de découverte GLOBALE (lot P15).
// Opt-in explicite, INVISIBLE PAR DÉFAUT, DERRIÈRE LE LOGIN.
//
// `subject: 'self'` DÉCLARÉ : le consentement est personnel, le staff ne
// l'inspecte ni ne le pose à la place de la joueuse — `?as=` → 403
// `subject_unsupported` (avant : ignoré, le staff lisait SA carte).

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { getMyDiscoveryCard, updateMyDiscoveryCard } from '../service';

export default defineSubjectRoute({
  key: 'player-discovery',
  GET: readSubject({
    subject: 'self',
    rateLimit: { max: 60, windowMs: 60_000 },
    cache: 'no-store',
    handler: ({ ctx }) =>
      getMyDiscoveryCard({ ...ctx, userId: ctx.subject.userId }),
  }),
  PUT: mutateSubject({
    subject: 'self',
    rateLimit: { max: 30, windowMs: 60_000 },
    cache: 'no-store',
    // Corps validé par le service (schéma partagé) : code historique
    // `INVALID_BODY` conservé.
    handler: ({ ctx, req }) =>
      updateMyDiscoveryCard({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
