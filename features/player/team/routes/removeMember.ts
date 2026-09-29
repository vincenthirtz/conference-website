// DELETE /api/teams/{teamId}/members — retrait d'un membre par l'équipe qui
// le gère (lot P10, même contrat). L'équipe est celle du CHEMIN : le service
// garde l'ordre historique des refus (400, 404, puis 403 `manage_roster`) et
// appelle la même garde que `team: { permission }`. Act-as conservé.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { RemoveTeamMemberBody } from '../schemas';
import { removeMember } from '../service/roster';

export default defineSubjectRoute({
  key: 'teams-remove-member',
  DELETE: mutateSubject({
    subject: 'follow',
    actAs: true,
    body: RemoveTeamMemberBody,
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ body, ctx, req }) => removeMember(ctx, req.query.teamId, body),
  }),
});
