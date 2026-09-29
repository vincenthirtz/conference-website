// POST /api/teams/add-member — ajout direct au roster par l'équipe gérée
// (lot P10, même contrat). `manage_roster` ; sujet = appelant (le staff
// passe par /api/admin/teams/add-member).

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { AddMemberBody } from '../schemas';
import { addMember } from '../service/membership';

export default defineSubjectRoute({
  key: 'add-member',
  tenantResolution: 'async',
  POST: mutateSubject({
    team: { permission: 'manage_roster' },
    body: AddMemberBody,
    rateLimit: { max: 10, windowMs: 10 * 60 * 1000 },
    handler: ({ body, ctx }) => addMember(ctx, body),
  }),
});
