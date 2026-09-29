// GET /api/player/scouting?team=<uuid> — dossier d'adversaire (N5) de
// l'équipe de la joueuse (ou de `?teamId=`) (lot P15). `subject: 'self'` :
// il joint les revues PRIVÉES de l'équipe, jamais montrées sous `?as=`.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { readScoutingReport } from '../service';

export default defineSubjectRoute({
  key: 'player-scouting',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'self',
    rateLimit: { max: 30, windowMs: 60_000 },
    // 30 s de cache privé sur la RÉUSSITE seulement (inchangé).
    cache: false,
    handler: async ({ ctx, req, res }) => {
      const payload = await readScoutingReport(
        { ...ctx, userId: ctx.subject.userId },
        {
          target: req.query.team,
          tz: req.query.tz,
          requestedTeamId: readRequestedTeamId(req),
        }
      );
      res.setHeader('Cache-Control', 'private, max-age=30');
      return payload;
    },
  }),
});
