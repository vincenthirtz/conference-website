// GET /api/player/notifications — compteurs « en attente » (cloche de la barre
// du haut, écran Notifications) (lot P15).
//
// `subject: 'follow'` (sémantique inchangée de la garde « sujet » historique) : le staff
// inspecte les compteurs d'une joueuse via `?as=` (journal
// `view_player_data`, réponse `no-store`). La cloche garde sa fréquence de
// relevé : 10 s de cache privé sur la réponse de la joueuse elle-même.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { readNotificationCounters } from '../service';

export default defineSubjectRoute({
  key: 'player-notifications',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 120, windowMs: 60_000 },
    cache: false,
    handler: async ({ ctx, req, res }) => {
      const payload = await readNotificationCounters(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      );
      // Épinglé en `private, no-store` par la garde sous inspection.
      res.setHeader('Cache-Control', 'private, max-age=10');
      return payload;
    },
  }),
});
