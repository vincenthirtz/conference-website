// PATCH /api/teams/update-member — BattleTag, SR déclaré, rôle / remplaçante
// d'un membre de l'équipe gérée (lot P10, même contrat). `manage_roster`,
// act-as conservé ; journal staff sur l'appelant réel.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { UpdateMemberBody } from '../schemas';
import { updateMember } from '../service/roster';

export default defineSubjectRoute({
  key: 'update-member',
  tenantResolution: 'async',
  PATCH: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: { permission: 'manage_roster' },
    body: UpdateMemberBody,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ body, ctx }) => updateMember(ctx, body),
  }),
});
