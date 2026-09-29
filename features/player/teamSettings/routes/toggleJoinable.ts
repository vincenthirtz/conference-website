// POST /api/teams/toggle-joinable — le capitaine (ou un rôle portant
// `manage_join_requests`) ouvre / ferme son équipe aux demandes de joueurs.
//
// Sujet suivi + act-as : le staff peut dépanner une capitaine bloquée
// (`?as=…&act=1`) ; l'équipe est alors résolue sur celle du SUJET.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { ToggleJoinableBody } from '../schemas';
import { toggleJoinable } from '../service';

export default defineSubjectRoute({
  key: 'toggle-joinable',
  tenantResolution: 'async',
  POST: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: { permission: 'manage_join_requests' },
    body: ToggleJoinableBody,
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ body, ctx }) => toggleJoinable(ctx, body),
  }),
});
