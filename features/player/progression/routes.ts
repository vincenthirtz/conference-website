// GET /api/player/progression — courbe de niveau du SUJET et jalons de son
// équipe. Lecture suivie : le staff l'inspecte via `?as=` (journal
// `view_player_data`, réponse épinglée `no-store`).

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { getProgression } from './service';

export default defineSubjectRoute({
  key: 'progression',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'follow',
    rateLimit: { max: 60, windowMs: 60_000 },
    // Politique de cache posée par le handler (cf. ci-dessous).
    cache: false,
    handler: async ({ ctx, req, res }) => {
      const { payload, hasTeam } = await getProgression(
        {
          db: ctx.db,
          tenantId: ctx.tenantId,
          logger: ctx.logger,
          userId: ctx.subject.userId,
        },
        readRequestedTeamId(req)
      );
      // Seule la réponse avec jalons d'équipe se garde 60 s (inchangé).
      if (hasTeam) res.setHeader('Cache-Control', 'private, max-age=60');
      return payload;
    },
  }),
});
