// POST / DELETE /api/teams/invitations/{invitationId} — relancer / annuler
// UNE invitation de l'équipe gérée (lot P10, même contrat). `manage_roster`
// (pas « l'émettrice seule » : l'équipe se gère à plusieurs), code de refus
// `FORBIDDEN`, act-as conservé. L'invitation doit appartenir à l'équipe.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import {
  assertInvitationId,
  cancelSentInvitation,
  resendSentInvitation,
} from '../service/invites';

const TEAM = {
  permission: 'manage_roster',
  forbiddenCode: 'FORBIDDEN',
} as const;
// La relance envoie un e-mail : même plafond que la création.
const RATE = { max: 10, windowMs: 10 * 60 * 1000 };

export default defineSubjectRoute({
  key: 'team-invite-action',
  tenantResolution: 'async',
  POST: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: TEAM,
    rateLimit: RATE,
    handler: ({ ctx, req }) =>
      resendSentInvitation(ctx, assertInvitationId(req.query.invitationId)),
  }),
  DELETE: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: TEAM,
    rateLimit: RATE,
    handler: ({ ctx, req }) =>
      cancelSentInvitation(ctx, assertInvitationId(req.query.invitationId)),
  }),
});
