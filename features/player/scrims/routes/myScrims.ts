// GET /api/player/scrims — les scrims de MON équipe (à rapporter, à venir,
// récents). Sans équipe gérée : 200 vide, pas 403. Inspection staff suivie.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { listMyScrims } from '../service/myScrims';

export default defineSubjectRoute({
  key: 'player-scrims',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 60, windowMs: 60_000 },
    cache: 'private, max-age=15',
    handler: ({ ctx, req }) =>
      listMyScrims(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      ),
  }),
});
