// lib/i18n/locales/admin-fr/adminRatings.ts
//
// Traductions FRANCAISES du namespace `adminRatings` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminRatings', {
  pageTitle: 'Admin – Ratings',
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Ratings',
  heading: 'Ratings joueurs',
  subtitle: 'Système de classement Glicko-2 des joueurs.',
  rebuildHeading: 'Reconstruction complète',
  rebuildDesc:
    "Recalcule l'intégralité des ratings Glicko-2 en rejouant tous les matchs terminés dans l'ordre chronologique. Les rosters actuels des équipes servent de base de backfill pour attribuer les matchs historiques aux joueurs. Utile après un correctif de données ou un changement de l'algorithme. C'est une opération lourde : à lancer hors période de pic.",
  playerCount_one: '{count} joueur',
  playerCount_other: '{count} joueurs',
  matchCount_one: '{count} match',
  matchCount_other: '{count} matchs',
  lastRebuild: 'Dernière reconstruction : {players} sur {matches}.',
  confirmTitle: 'Reconstruire tous les ratings ?',
  confirmSubtitle:
    "Opération lourde : recalcule tout l'historique des ratings depuis le premier match. Peut prendre du temps.",
  confirmLabel: 'Reconstruire',
  rebuilding: 'Reconstruction…',
  rebuildBtn: 'Reconstruire les ratings',
  toastRebuilt: 'Ratings reconstruits : {players}, {matches}.',
  errorRebuild: 'Erreur lors de la reconstruction.',
  errorLoadBoard: 'Erreur lors du chargement du classement.',
  boardHeading: 'Top classement',
  leaguesLink: 'Ligues →',
  retry: 'Réessayer',
  emptyTitle: 'Aucun joueur noté',
  emptyDesc:
    'Lance une reconstruction après avoir enregistré des résultats de matchs.',
  colPlayer: 'Joueur',
  colRating: 'Rating',
  colGames: 'Parties',
  colWinLoss: 'V / D',
  coverageHeading: 'Couverture du rating',
  coverageDesc:
    "Un match terminé ne produit un rating que si les DEUX équipes ont des membres rattachés à un compte. Sinon il reste non noté, sans erreur — c'est ici qu'on le voit.",
  coverageUnavailable: 'Couverture indisponible pour le moment.',
  coverageFinished: '{count} match(s) terminé(s)',
  coverageRated: '{count} noté(s)',
  coverageUnrated: '{count} non noté(s)',
  coverageColMatch: 'Match',
  coverageColReason: 'Pourquoi',
  coverageReasonNoParticipants: 'Aucun roster rattaché (les deux équipes)',
  coverageReasonOneSide: "Roster rattaché d'un seul côté",
  coverageReasonUnknown: 'Rosters présents mais aucun rating — à investiguer',
});
