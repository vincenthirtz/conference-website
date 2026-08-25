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
  axisNavLabel: 'Axes du classement',
  axisRating: 'Rating',
  axisProgress: 'Progression',
  axisSeason: 'Saison',
  thDelta: 'Variation',
  matchCount_one: '{count} match',
  matchCount_other: '{count} matchs',
  progressCaption:
    'Plus fortes progressions de rating sur les {days} derniers jours.',
  progressEmpty:
    "Aucun match officiel n'a été joué sur les dernières semaines. Cet onglet se remplira dès la reprise.",
  seasonCaption: 'Progression de rating cumulée sur les tournois de {season}.',
  seasonCaptionFallback: 'Progression de rating cumulée sur la saison.',
  seasonStandingsLink: 'Voir le classement par équipe →',
  seasonEmpty:
    "Aucun résultat sur cette saison pour l'instant. Le classement apparaîtra dès le premier tournoi joué.",
});
