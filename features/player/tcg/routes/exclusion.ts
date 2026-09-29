// /api/player/tcg/exclusion — lot P14. `subject: 'self'` : un consentement
// ne se donne ni ne se retire au nom de quelqu'un.
//   GET → suis-je retirée ? ; POST → me retirer ; DELETE → revenir.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import {
  readExclusion,
  rejoinTcg,
  withdrawFromTcg,
} from '../service/exclusion';

export default defineSubjectRoute({
  key: 'player-tcg-exclusion',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) => readExclusion({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ ctx }) =>
      withdrawFromTcg({ ...ctx, userId: ctx.subject.userId }),
  }),
  DELETE: mutateSubject({
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ ctx }) => rejoinTcg({ ...ctx, userId: ctx.subject.userId }),
  }),
});
