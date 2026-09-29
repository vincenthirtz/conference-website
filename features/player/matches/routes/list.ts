// GET /api/player/matches — « Mes matchs » : tous les matchs de l'équipe de
// la joueuse (ou de `?teamId=`). Lecture suivie : le staff l'inspecte via
// `?as=` (journal `view_player_data`, réponse épinglée `no-store`).

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { listPlayerMatches } from '../service/list';

export default defineSubjectRoute({
  key: 'player-matches',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 60, windowMs: 60_000 },
    // Politique de cache posée par le handler : seule la liste d'une équipe
    // se garde 15 s (inchangé ; sans équipe, aucun en-tête).
    cache: false,
    handler: async ({ ctx, req, res }) => {
      const payload = await listPlayerMatches(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      );
      if (payload.team) res.setHeader('Cache-Control', 'private, max-age=15');
      return payload;
    },
  }),
});
