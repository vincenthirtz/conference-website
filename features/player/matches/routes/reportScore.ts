// POST /api/player/matches/{matchId}/report-score — la capitaine déclare le
// score final d'un de ses matchs (réconciliation à deux voix, cf. service).
//
// Sujet `self` : c'est la personne connectée qui vote pour son équipe —
// l'act-as staff n'a pas de sens ici (le staff saisit le score par l'admin).
// Idempotence honorée si le client envoie une `Idempotency-Key` : un double
// tap rejoue la première réponse au lieu de réécrire.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { revalidateMatchPages } from '@/utils/matches/revalidateMatchPages';
import { reportScore } from '../service/reportScore';

export default defineSubjectRoute({
  key: 'player-report-score',
  POST: mutateSubject({
    rateLimit: { max: 20, windowMs: 60_000 },
    // Query et corps validés par le service : messages historiques conservés.
    handler: ({ ctx, req, res }) =>
      reportScore({ ...ctx, userId: ctx.subject.userId }, req.query, req.body, {
        revalidate: (matchId) =>
          revalidateMatchPages(res, { tenantId: ctx.tenantId, matchId }),
      }),
  }),
});
