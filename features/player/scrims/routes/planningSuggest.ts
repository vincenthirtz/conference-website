// GET /api/teams/scrim-plannings/{planningId}/suggest — « mes dispos
// habituelles » rejouées sur cette grille. Session ouverte (409 sinon) et
// partie requise (403). Sujet `self`.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { PlanningIdQuery } from '../schemas';
import { suggestPlanningSlots } from '../service/plannings';

export default defineSubjectRoute({
  key: 'teams-scrim-plannings-suggest',
  tenantResolution: 'async',
  GET: readSubject({
    query: PlanningIdQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, query }) =>
      suggestPlanningSlots(
        { ...ctx, userId: ctx.subject.userId },
        query.planningId
      ),
  }),
});
