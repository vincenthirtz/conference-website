// GET / PATCH /api/player/team — « Mon équipe » (ex-/api/admin/teams/my,
// qui en reste un réexport le temps d'une version ; lot P10).
//
// GET suit le sujet : le staff inspecte l'écran d'une capitaine (`?as=`,
// journal `view_captain_data`). PATCH s'ouvre à l'act-as journalisé
// (`?as=…&act=1`, `act_as_player`) : le service résout le droit
// `manage_team_info` du SUJET, jamais celui du staff.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { TeamInfoPatchBody } from '../schemas';
import { getMyTeam, patchMyTeam } from '../service/myTeam';

const RATE = { max: 60, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'my-team',
  tenantResolution: 'async',
  inspectionAudit: 'view_captain_data',
  GET: readSubject({
    subject: 'follow',
    rateLimit: RATE,
    handler: ({ ctx, req }) => getMyTeam(ctx, readRequestedTeamId(req)),
  }),
  PATCH: mutateSubject({
    subject: 'follow',
    actAs: true,
    body: TeamInfoPatchBody,
    rateLimit: RATE,
    handler: ({ body, ctx }) => patchMyTeam(ctx, body),
  }),
});
