// features/admin/matches/routes/checkinStaff.ts — POST /api/admin/matches/[matchId]/checkin-staff
// `{ teamSide: 1 | 2, reason: string }` : le staff pointe une équipe à sa
// place (rattrapage, y compris après le coup d'envoi tant que le forfait
// automatique n'est pas tombé). Motif obligatoire, journalisé (`checkin`).
// Garde `arbitrate_matches` (pas `run_checkin`) : pointer après le coup
// d'envoi écarte un forfait — c'est une décision d'arbitrage.
// Idempotency-Key + écriture conditionnelle : un double-clic ne pointe qu'une
// fois et un rejeu répond `alreadyCheckedIn: true`.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CheckinStaffBody, MatchIdQuery } from '../schemas';
import { checkInTeamAsStaff } from '../service/checkinStaff';

export default defineAdminRoute({
  key: 'match-checkin-staff',
  guard: { permission: 'arbitrate_matches' },
  POST: mutate({
    query: MatchIdQuery,
    body: CheckinStaffBody,
    audit: 'checkin',
    handler: ({ query, body, ctx }) =>
      audited(ctx, checkInTeamAsStaff(ctx, query.matchId, body)),
  }),
});
