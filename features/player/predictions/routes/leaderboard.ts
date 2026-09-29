// GET /api/player/predictions/leaderboard — classement des pronostiqueuses
// (espace, ou un tournoi : `?tournamentId=`). PUT — j'accepte (ou je retire)
// d'y être NOMMÉE. Derrière connexion et `no-store` (valeur du noyau) : un
// classement de spectatrices n'a rien à faire dans un moteur de recherche.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { getLeaderboard, setVisibility } from '../service';

export default defineSubjectRoute({
  key: 'player-predictions-leaderboard',
  GET: readSubject({
    rateLimit: false,
    handler: ({ ctx, req }) =>
      getLeaderboard(
        { ...ctx, userId: ctx.subject.userId },
        req.query.tournamentId
      ),
  }),
  PUT: mutateSubject({
    rateLimit: { max: 20, windowMs: 60_000 },
    // Corps validé par le service (schéma partagé) : code historique
    // `invalid_choice` conservé.
    handler: ({ ctx, req }) =>
      setVisibility({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
