// /api/player/predictions/{matchId} — le pronostic de la joueuse sur UN match.
//   GET    → ouvert/verrouillé, son pronostic, la récompense, la répartition
//            une fois verrouillé ;
//   PUT    → pronostiquer ou changer d'avis tant que c'est ouvert ;
//   DELETE → retirer son pronostic tant que c'est ouvert.
// Corps et identifiant validés par le service, dans l'ordre historique (un
// match verrouillé répond 409 avant qu'on lise le corps).

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import {
  deleteMatchPrediction,
  getMatchPrediction,
  putMatchPrediction,
} from '../service';

const WRITE_LIMIT = { max: 30, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'player-predictions-match',
  GET: readSubject({
    rateLimit: false,
    handler: ({ ctx, req }) =>
      getMatchPrediction(
        { ...ctx, userId: ctx.subject.userId },
        req.query.matchId
      ),
  }),
  PUT: mutateSubject({
    rateLimit: WRITE_LIMIT,
    handler: ({ ctx, req }) =>
      putMatchPrediction(
        { ...ctx, userId: ctx.subject.userId },
        req.query.matchId,
        req.body
      ),
  }),
  DELETE: mutateSubject({
    rateLimit: WRITE_LIMIT,
    handler: ({ ctx, req }) =>
      deleteMatchPrediction(
        { ...ctx, userId: ctx.subject.userId },
        req.query.matchId
      ),
  }),
});
