// GET /api/player/matches/{matchId} — le fil d'UN match, vu par quelqu'un qui
// le joue. Lecture suivie (`?as=`, inspection staff en lecture seule).

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { getPlayerMatchDetail } from '../service/detail';

export default defineSubjectRoute({
  key: 'player-match-detail',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 60, windowMs: 60_000 },
    // Cache posé sur la seule réponse réussie (un 404 ne se garde pas).
    cache: false,
    handler: async ({ ctx, req, res }) => {
      const detail = await getPlayerMatchDetail(
        { ...ctx, userId: ctx.subject.userId },
        req.query.matchId
      );
      res.setHeader('Cache-Control', 'private, max-age=15');
      return detail;
    },
  }),
});
