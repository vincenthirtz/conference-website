// GET /api/player/dashboard — l'agrégat du tableau de bord joueuse. Lecture
// suivie : le staff l'inspecte via `?as=` (journal, réponse `no-store`) ;
// l'équipe demandée passe par `?teamId=` (manager multi-équipes).

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { getPlayerDashboard } from './service';

export default defineSubjectRoute({
  key: 'player-dashboard',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      getPlayerDashboard(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      ),
  }),
});
