// /api/player/tcg/showcase — lot P14. `subject: 'self'` : régler la vitrine
// de quelqu'un d'autre n'a pas de sens.
//   GET → ma vitrine (relue contre ma possession) ;
//   PUT → la régler, puis régénérer la fiche publique AVANT de relire :
//         désactiver la retire IMMÉDIATEMENT (pas après les 300 s d'ISR).

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';
import { readShowcase, saveShowcase } from '../service/showcase';

export default defineSubjectRoute({
  key: 'player-tcg-showcase',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) => readShowcase({ ...ctx, userId: ctx.subject.userId }),
  }),
  PUT: mutateSubject({
    rateLimit: { max: 20, windowMs: 60_000 },
    handler: async ({ ctx, req, res }) => {
      const sctx = { ...ctx, userId: ctx.subject.userId };
      await saveShowcase(sctx, req.body);
      await revalidatePlayerCard(res, sctx.userId);
      return readShowcase(sctx);
    },
  }),
});
