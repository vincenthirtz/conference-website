// lib/i18n/locales/fr/leaderboardPage.ts
//
// Traductions FRANCAISES du namespace `leaderboardPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('leaderboardPage', {
  eyebrow: 'Classement',
  title: 'Classement des joueuses',
  subtitle:
    "Rating calculé à partir des matchs officiels. L'incertitude (RD) reflète la fiabilité du score : plus elle est basse, plus le rating est stable.",
  thRank: 'Rang',
  thPlayer: 'Joueuse',
  thRating: 'Rating',
  thMatches: 'Matchs',
  thWinLoss: 'V - D',
  loadMore: 'Voir plus',
  loading: 'Chargement…',
  unknownPlayer: 'Joueuse inconnue',
  emptyTitle: 'Aucune joueuse classée',
  emptyBody:
    'Le classement se remplira dès que des matchs officiels auront été joués. Revenez bientôt !',
  errorTitle: 'Impossible de charger le classement',
  errorBody: 'Une erreur est survenue. Réessayez dans quelques instants.',
  retry: 'Réessayer',
});
