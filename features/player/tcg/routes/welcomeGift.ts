// /api/player/tcg/welcome-gift — lot P14.
//   GET  → `subject: 'follow'` : le tableau de bord est partagé avec
//          l'inspection staff (`?as=`, journal, `no-store`) ;
//   POST → réclamer. `follow` SANS `actAs` : un `?as=` est refusé
//          (`subject_read_only`) — un cadeau réclamé ne se rend pas.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { claimWelcomeGift, readWelcomeGift } from '../service/welcomeGift';

export default defineSubjectRoute({
  key: 'player-tcg-welcome-gift',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) =>
      readWelcomeGift({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    subject: 'follow',
    rateLimit: { max: 6, windowMs: 60_000 },
    handler: ({ ctx }) =>
      claimWelcomeGift({ ...ctx, userId: ctx.subject.userId }),
  }),
});
