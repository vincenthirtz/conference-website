// PATCH /api/teams/update-member-role — rôle d'un membre de l'équipe gérée
// (lot P10, même contrat). `manage_roster` sur l'équipe de `?teamId=`, dans
// le tenant du sujet ; act-as staff journalisé conservé (`?as=…&act=1`).

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { UpdateMemberRoleBody } from '../schemas';
import { updateMemberRole } from '../service/roster';

export default defineSubjectRoute({
  key: 'update-member-role',
  tenantResolution: 'async',
  PATCH: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: { permission: 'manage_roster' },
    body: UpdateMemberRoleBody,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ body, ctx }) => updateMemberRole(ctx, body),
  }),
});
