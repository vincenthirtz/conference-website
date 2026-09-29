// features/admin/tournaments/routes/scheduleMove.ts — POST …/[id]/schedule-move
// Déplacer un ou plusieurs matchs, aperçu d'impact d'abord (lot 5).
// `apply: false` (défaut) n'écrit rien ; une anomalie BLOQUANTE refuse
// l'écriture en 409 sauf `force: true`.

import {
  RESPONSE_SENT,
  defineAdminRoute,
  mutate,
} from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CodedTournamentIdQuery, ScheduleMoveLooseBody } from '../schemas';
import { codedTournamentId } from '../service/common';
import { moveMatches } from '../service/schedule';

export default defineAdminRoute({
  key: 'admin-schedule-move',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: CodedTournamentIdQuery,
    body: ScheduleMoveLooseBody,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'match_rescheduled',
    handler: async ({ query, body, ctx, res }) => {
      const id = codedTournamentId(
        query.id,
        'Invalid tournament id',
        'INVALID_TOURNAMENT_ID'
      );
      const r = await audited(ctx, moveMatches(ctx, id, body));
      // Échec partiel : 500 historique, journal quand même écrit (les
      // déplacements réussis sont faits).
      if ('partial' in r) {
        res.status(500).json(r.partial);
        return RESPONSE_SENT;
      }
      return r;
    },
  }),
});
