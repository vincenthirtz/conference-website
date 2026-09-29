// GET /api/player/teams-directory — annuaire d'équipes connecté (R4). Sujet
// `self` : la disponibilité datée d'une équipe reste derrière login.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { loadTeamsDirectory } from '../service/directory';

export default defineSubjectRoute({
  key: 'teams-directory',
  tenantResolution: 'async',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    cache: 'private, max-age=15',
    handler: ({ ctx, req }) =>
      loadTeamsDirectory(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      ),
  }),
});
