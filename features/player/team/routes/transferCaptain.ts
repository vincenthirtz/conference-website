// PATCH /api/teams/transfer-captain — transfert (capitaine en poste) ou
// attribution (manager `manage_roster`) du capitanat (lot P10, même contrat).
// Act-as conservé : c'est le capitanat du SUJET qui est transmis.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { TransferCaptainBody } from '../schemas';
import { transferCaptain } from '../service/captaincy';

export default defineSubjectRoute({
  key: 'teams-transfer-captain',
  tenantResolution: 'async',
  PATCH: mutateSubject({
    subject: 'follow',
    actAs: true,
    body: TransferCaptainBody,
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ body, ctx, req }) =>
      transferCaptain(ctx, body, readRequestedTeamId(req)),
  }),
});
