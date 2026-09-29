// GET / POST / DELETE /api/teams/member-permissions — droits délégués (J3),
// lot P10. `manage_roster` exigé sur l'équipe de `?teamId=`, résolue dans le
// tenant du sujet. GET suit le sujet (inspection staff) ; les écritures
// restent l'affaire de l'appelante (pas d'act-as, comme avant).

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { MemberPermissionBody } from '../schemas';
import { getMemberRights, setMemberRight } from '../service/rights';

const RATE = { max: 30, windowMs: 60_000 };
const ROSTER = { permission: 'manage_roster' } as const;

export default defineSubjectRoute({
  key: 'team-member-perms',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'follow',
    team: ROSTER,
    rateLimit: RATE,
    handler: ({ ctx }) => getMemberRights(ctx),
  }),
  POST: mutateSubject({
    subject: 'follow',
    team: ROSTER,
    body: MemberPermissionBody,
    rateLimit: RATE,
    handler: ({ body, ctx }) => setMemberRight(ctx, body, true),
  }),
  DELETE: mutateSubject({
    subject: 'follow',
    team: ROSTER,
    body: MemberPermissionBody,
    rateLimit: RATE,
    handler: ({ body, ctx }) => setMemberRight(ctx, body, false),
  }),
});
