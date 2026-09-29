// POST /api/teams/leave — quitter son équipe (lot P10, même contrat).
// Appartenance vérifiée par le service (`?teamId=` exigé si plusieurs) ; pas
// de permission d'équipe : partir est un droit de membre.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { leaveTeam } from '../service/membership';

export default defineSubjectRoute({
  key: 'teams-leave',
  tenantResolution: 'async',
  POST: mutateSubject({
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ ctx, req }) => leaveTeam(ctx, readRequestedTeamId(req)),
  }),
});
