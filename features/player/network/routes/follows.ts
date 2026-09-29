// GET/POST/DELETE /api/player/follows — suivi joueuse cross-tenant, DERRIÈRE
// LE LOGIN (lot P15). On ne suit qu'une joueuse découvrable ; les listes ne
// rendent que des joueuses découvrables. `subject: 'self'` sur chaque
// méthode : le graphe social n'est ni inspecté ni modifié par le staff.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { follow, listFollows, unfollow } from '../service';

const RATE = { max: 60, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'player-follows',
  GET: readSubject({
    subject: 'self',
    rateLimit: RATE,
    cache: 'no-store',
    handler: ({ ctx, req }) =>
      listFollows({ ...ctx, userId: ctx.subject.userId }, req.query),
  }),
  // Corps validés par le service : code historique `INVALID_BODY`.
  POST: mutateSubject({
    subject: 'self',
    rateLimit: RATE,
    cache: 'no-store',
    handler: ({ ctx, req }) =>
      follow({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
  DELETE: mutateSubject({
    subject: 'self',
    rateLimit: RATE,
    cache: 'no-store',
    handler: ({ ctx, req }) =>
      unfollow({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
