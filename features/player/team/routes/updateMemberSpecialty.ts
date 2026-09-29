// PATCH /api/teams/update-member-specialty — poste in-game d'un membre de
// l'équipe gérée (lot P10, même contrat). `manage_roster`, act-as conservé.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { UpdateMemberSpecialtyBody } from '../schemas';
import { updateMemberSpecialty } from '../service/roster';

export default defineSubjectRoute({
  key: 'update-member-specialty',
  tenantResolution: 'async',
  PATCH: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: { permission: 'manage_roster' },
    body: UpdateMemberSpecialtyBody,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ body, ctx }) => updateMemberSpecialty(ctx, body),
  }),
});
