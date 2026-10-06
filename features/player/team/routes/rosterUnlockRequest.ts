// POST /api/teams/roster-unlock-request — demande de dérogation au verrou de
// roster (lot P7). `manage_roster` : c'est le droit que le verrou bloque.
// Crée un ticket de support `roster_unlock` traité par le staff.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { RosterUnlockRequestBody } from '../rosterUnlockSchemas';
import { requestRosterUnlock } from '../service/rosterUnlock';

export default defineSubjectRoute({
  key: 'roster-unlock-request',
  tenantResolution: 'async',
  POST: mutateSubject({
    team: { permission: 'manage_roster' },
    actAs: true,
    body: RosterUnlockRequestBody,
    rateLimit: { max: 5, windowMs: 60 * 60 * 1000 },
    handler: ({ body, ctx }) => requestRosterUnlock(ctx, body),
  }),
});
