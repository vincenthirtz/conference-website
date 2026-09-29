// GET / POST /api/teams/invitations — invitations nominatives émises par
// l'équipe gérée (lot P10, même contrat). `manage_roster`, refus au code
// historique `FORBIDDEN` ; act-as conservé sur l'envoi (au nom de la
// capitaine). Corps validé par le service (message et code historiques).

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { inviteByEmail, listSentInvitations } from '../service/invites';

const TEAM = {
  permission: 'manage_roster',
  forbiddenCode: 'FORBIDDEN',
} as const;

export default defineSubjectRoute({
  key: 'team-invite',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'follow',
    team: TEAM,
    handler: ({ ctx }) => listSentInvitations(ctx),
  }),
  POST: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: TEAM,
    status: 201,
    // Peut créer des comptes et envoyer des e-mails : plafond serré.
    rateLimit: { max: 10, windowMs: 10 * 60 * 1000 },
    handler: ({ ctx, req }) => inviteByEmail(ctx, req.body),
  }),
});
