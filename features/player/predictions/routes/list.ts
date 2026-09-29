// GET /api/player/predictions — les matchs à pronostiquer (à venir, encore
// ouverts, hors matchs de ses propres équipes) et ses derniers pronostics.
// Alimente le panneau « Pronostics » (page TCG, /player/pronostics).
// Sujet : la joueuse elle-même (`self`, comme la route historique).

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { getStaffByUserId } from '@/utils/staff';
import { listPredictions } from '../service';

export default defineSubjectRoute({
  key: 'player-predictions',
  GET: readSubject({
    rateLimit: false,
    // Réponse personnelle : `private, no-store` (valeur du noyau).
    handler: async ({ ctx }) => {
      const staff = await getStaffByUserId(ctx.subject.userId);
      return listPredictions(
        { ...ctx, userId: ctx.subject.userId },
        Boolean(staff)
      );
    },
  }),
});
