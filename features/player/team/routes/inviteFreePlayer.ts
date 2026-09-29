// POST /api/teams/invite-free-player — inviter une joueuse libre liée (lot
// P10, même contrat). `manage_roster` ET l'équipe du corps = l'équipe gérée ;
// sujet = appelant. Corps validé par le service (message + code historiques).

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { inviteFreePlayer } from '../service/recruiting';

export default defineSubjectRoute({
  key: 'teams-invite-free-player',
  tenantResolution: 'async',
  POST: mutateSubject({
    team: { permission: 'manage_roster' },
    rateLimit: { max: 20, windowMs: 10 * 60 * 1000 },
    handler: ({ ctx, req }) => inviteFreePlayer(ctx, req.body),
  }),
});
