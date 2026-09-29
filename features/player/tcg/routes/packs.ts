// /api/player/tcg/packs — lot P14. `subject: 'self'` sur les deux méthodes.
//   GET  → mes paquets (curseur, `status`), mon solde, le barème ;
//   POST → ouvrir un paquet. La réservation atomique EN BASE
//          (`opened_at IS NULL`) porte l'invariant ; l'Idempotency-Key s'y
//          AJOUTE.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { listPacks } from '../service/packs';
import { openPack } from '../service/openPack';

export default defineSubjectRoute({
  key: 'player-tcg-packs',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      listPacks(
        { ...ctx, userId: ctx.subject.userId },
        {
          limit: req.query.limit,
          cursor: req.query.cursor,
          status: req.query.status,
        }
      ),
  }),
  POST: mutateSubject({
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      openPack({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
