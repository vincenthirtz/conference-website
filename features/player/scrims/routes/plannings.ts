// GET /api/teams/scrim-plannings — sessions de planning OUVERTES visibles
// (je gère team1 ou team2, ou je suis staff), avec ma partie et MES seules
// peintures : aucune attribution cross-équipe. Inspection staff suivie
// (journal `view_captain_data`).

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { listMyPlannings } from '../service/plannings';

export default defineSubjectRoute({
  key: 'teams-scrim-plannings',
  tenantResolution: 'async',
  inspectionAudit: 'view_captain_data',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      listMyPlannings(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      ),
  }),
});
