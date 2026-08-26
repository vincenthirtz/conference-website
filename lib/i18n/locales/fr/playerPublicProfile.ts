// lib/i18n/locales/fr/playerPublicProfile.ts
//
// Traductions FRANCAISES du namespace `playerPublicProfile` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerPublicProfile', {
  backToLeaderboard: '← Retour au classement',
  ratingProgression: 'Progression du rating',
  tierBronze: 'bronze',
  tierSilver: 'argent',
  tierGold: 'or',
  tierPlatinum: 'platine',
  badges: 'Badges',
  palmares: 'Palmarès',
  tournamentFallback: 'Tournoi',
  withTeam: 'avec',
  firstPlace: '1re place',
  secondPlace: '2e place',
  thirdPlace: '3e place',
  nthPlace: '{rank}e place',
  seasons: 'Saisons',
  thLeague: 'League',
  thRank: 'Rang',
  thPoints: 'Points',
  leagueFallback: 'League',
  rankLabel: 'Rang',
  matchesCount_one: '{count} match',
  matchesCount_other: '{count} matchs',
  winRatePct: '{rate}% de victoires',
  ratingUncertaintyTitle:
    'Incertitude du rating (écart-type). Plus la valeur est basse, plus le rating est fiable.',
  ratingDelta: '± {rd} · pic {peak}',
  statWins: 'Victoires',
  statLosses: 'Défaites',
  statPeak: 'Pic de rating',
  chartNotEnough:
    'Pas encore assez de matchs pour tracer une courbe de progression.',
  chartMin: 'Min {value}',
  chartMax: 'Max {value}',
  chartPts: '{delta} pts',
  chartAriaLabel:
    'Courbe de progression du rating, de {first} à {last} points sur {count} matchs.',
  recentMatches: 'Derniers matchs',
  noRecentMatches: 'Aucun match récent.',
  vs: 'vs',
  unknownOpponent: 'Adversaire inconnu',
  resultWin: 'V',
  resultLoss: 'D',
  resultDraw: 'N',
  headToHead: 'Face-à-face',
  noHeadToHead: 'Aucun face-à-face enregistré.',
  thOpponent: 'Adversaire',
  thWinLoss: 'V - D',
  thMatches: 'Matchs',
  unknownPlayer: 'Joueuse inconnue',
  notFoundTitle: 'Joueuse introuvable',
  notFoundBody: "Cette joueuse n'existe pas ou n'a pas encore de rating.",
  viewLeaderboard: 'Voir le classement',
  errorTitle: 'Impossible de charger ce profil',
  errorBody: 'Une erreur est survenue. Réessayez dans quelques instants.',
  retry: 'Réessayer',
  share: 'Partager',
  shareAriaLabel: 'Partager ce profil',
  shareTitle: "Profil de {name} sur OW Women's Cup",
  linkCopied: 'Lien copié',
  shareError: 'Impossible de copier le lien',
  shareOnX: 'Partager sur X',
  shareOnBluesky: 'Partager sur Bluesky',
});
