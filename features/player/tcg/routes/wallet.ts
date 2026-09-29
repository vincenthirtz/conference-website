// /api/player/tcg/wallet — GET : les 50 derniers mouvements du porte-monnaie
// (lot P14). `subject: 'self'` (ex-garde « auth » historique) : `?as=` refusé.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readWallet } from '../service/wallet';

export default defineSubjectRoute({
  key: 'player-tcg-wallet',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) => readWallet({ ...ctx, userId: ctx.subject.userId }),
  }),
});
