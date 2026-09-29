// GET /api/teams/scrim-plannings/{planningId} — détail d'une session pour une
// de ses parties : session, ma partie (403 sinon, via resolvePlanningParty),
// mes créneaux et une heatmap ANONYMISÉE. Sujet `self`.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { PlanningIdQuery } from '../schemas';
import { readPlanningForParty } from '../service/plannings';

export default defineSubjectRoute({
  key: 'teams-scrim-plannings-detail',
  tenantResolution: 'async',
  GET: readSubject({
    query: PlanningIdQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, query }) =>
      readPlanningForParty(
        { ...ctx, userId: ctx.subject.userId },
        query.planningId
      ),
  }),
});
