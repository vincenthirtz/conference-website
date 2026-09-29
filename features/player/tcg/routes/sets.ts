// /api/player/tcg/sets — GET : la progression de mes séries (lot P14).
//
// `subject: 'self'` (ex-garde « auth » historique), À DESSEIN : cette lecture peut
// créditer une série complète (rattrapage idempotent par sa clé en base) ;
// une inspection staff ne doit rien déclencher au nom de quelqu'un.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readCollectionSets } from '../service/sets';

export default defineSubjectRoute({
  key: 'player-tcg-sets',
  GET: readSubject({
    subject: 'self',
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx }) =>
      readCollectionSets({
        tenantId: ctx.tenantId,
        userId: ctx.subject.userId,
      }),
  }),
});
