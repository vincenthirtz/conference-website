// GET /api/player/next-match — le prochain match de l'équipe et son check-in.
// Lecture suivie (`?as=`, inspection staff) ; `?teamId=` pour un manager
// multi-équipes.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { getNextMatch } from '../service';

export default defineSubjectRoute({
  key: 'next-match',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 60, windowMs: 60_000 },
    // Seule une réponse AVEC match se garde 15 s (inchangé).
    cache: false,
    handler: async ({ ctx, req, res }) => {
      const payload = await getNextMatch(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      );
      if (payload.match) res.setHeader('Cache-Control', 'private, max-age=15');
      return payload;
    },
  }),
});
