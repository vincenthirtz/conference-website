// PUT /api/teams/scrim-plannings/{planningId}/availability — je remplace MES
// créneaux sur la session (UPSERT (planning_id, user_id) ; liste vide =
// effacer). Session ouverte (409), partie requise (403), créneaux dans la
// grille de CETTE session (400, normalizePlanningSlots). Sujet `self`.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { PlanningAvailabilityBody, PlanningIdQuery } from '../schemas';
import { saveMyAvailability } from '../service/plannings';

export default defineSubjectRoute({
  key: 'teams-scrim-plannings-availability',
  tenantResolution: 'async',
  PUT: mutateSubject({
    query: PlanningIdQuery,
    body: PlanningAvailabilityBody,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, query, body }) =>
      saveMyAvailability(
        { ...ctx, userId: ctx.subject.userId },
        query.planningId,
        body,
        ctx.user.user_metadata
      ),
  }),
});
