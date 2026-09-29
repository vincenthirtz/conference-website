// GET / POST / DELETE /api/teams/invite-links — le lien d'équipe (lot P10,
// même contrat) : lire l'état, (re)générer (jeton rendu une fois), révoquer.
// `manage_roster`, code de refus `FORBIDDEN`, act-as conservé.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import {
  getInviteLink,
  revokeInviteLink,
  rotateInviteLink,
} from '../service/invites';

const TEAM = {
  permission: 'manage_roster',
  forbiddenCode: 'FORBIDDEN',
} as const;

export default defineSubjectRoute({
  key: 'team-invite-link',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'follow',
    team: TEAM,
    handler: ({ ctx }) => getInviteLink(ctx),
  }),
  POST: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: TEAM,
    status: 201,
    // Régénérer révoque le précédent : une boucle casserait la diffusion.
    rateLimit: { max: 10, windowMs: 10 * 60 * 1000 },
    handler: ({ ctx, req }) => rotateInviteLink(ctx, req.body),
  }),
  DELETE: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: TEAM,
    handler: ({ ctx }) => revokeInviteLink(ctx),
  }),
});
