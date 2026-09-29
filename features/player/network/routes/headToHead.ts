// GET /api/player/discovery/head-to-head?opponentId= — face-à-face
// CROSS-TENANT entre l'appelante et une joueuse DÉCOUVRABLE (lot P15),
// DERRIÈRE LE LOGIN, jamais inspectable (`subject: 'self'`).

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readHeadToHead } from '../service';

export default defineSubjectRoute({
  key: 'player-discovery-h2h',
  GET: readSubject({
    subject: 'self',
    rateLimit: { max: 60, windowMs: 60_000 },
    cache: 'no-store',
    handler: ({ ctx, req }) =>
      readHeadToHead({ ...ctx, userId: ctx.subject.userId }, req.query),
  }),
});
