// lib/i18n/locales/admin-fr/adminStageSwiss.ts
//
// Traductions FRANCAISES du namespace `adminStageSwiss` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStageSwiss', {
  statusPending: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  statusCancelled: 'Annulé',
  errUnexpected: 'Erreur inattendue',
  errPreview: "Erreur lors de l'apercu des pairings Swiss",
  errPreviewShort: "Erreur lors de l'apercu",
  confirmRematchTitle: 'Cet appariement contient des rematches',
  confirmRematchSubtitle:
    'Deux equipes vont se rejouer (le solveur n a pas trouve mieux). Confirmer la generation ?',
  confirmRematchLabel: 'Generer quand meme',
  errGenerate: 'Erreur lors de la generation de la ronde Swiss',
  toastGenerated: 'Ronde Swiss #{round} generee : {count} matchs crees.',
  errGenerateShort: 'Erreur lors de la generation de la ronde',
  pageTitle: 'Admin – Swiss stage',
  back: '← Retour à la phase',
  heading: 'Gestion Swiss',
  phaseLabel: 'Phase :',
  tournamentLabel: '• Tournoi',
  currentRound: 'Ronde actuelle : {round}',
  refreshData: 'Rafraichir les donnees',
  previewCalculating: 'Calcul en cours…',
  previewNextRound: 'Apercu de la prochaine ronde',
  exportCsv: 'Exporter CSV',
  toolbarHelp:
    'La generation utilise le systeme de pairing Swiss (victoires, Buchholz, etc.) et evite les rematches autant que possible.',
  previewTitle: 'Apercu — Ronde #{round}',
  previewMatchCount_one: '{count} match proposes',
  previewMatchCount_other: '{count} matches proposes',
  previewHasRematches: '(contient des rematches)',
  generating: 'Generation en cours…',
  confirmGenerate: 'Confirmer et generer',
  cancel: 'Annuler',
  vs: 'vs',
  loadingData: 'Chargement des donnees Swiss…',
  stageNotFound: 'Phase introuvable.',
  standingsTitle: 'Classement Swiss (standings)',
  teamCount_one: '{count} équipe',
  teamCount_other: '{count} équipes',
  emptyStandings:
    'Aucun classement disponible. Assure-toi que des équipes sont rattachées à la phase et que des rondes ont été jouées.',
  thTeam: 'Équipe',
  thWins: 'V',
  thLosses: 'D',
  thDraws: 'N',
  thPoints: 'Pts',
  thMaps: 'Maps +/−',
  thBuchholz: 'Buchholz',
  thOppWinrate: 'Winrate adv.',
  roundsTitle: 'Rondes Swiss & matches',
  roundCount_one: '{count} ronde',
  roundCount_other: '{count} rondes',
  emptyRounds:
    'Aucune ronde n\'est encore générée. Utilise le bouton "Générer la prochaine ronde Swiss" pour créer la ronde #1.',
  roundTitle: 'Ronde Swiss #{round}',
  matchCount_one: '{count} match',
  matchCount_other: '{count} matches',
  scorePrefix: 'Score :',
  openAdmin: 'Ouvrir (admin)',
  publicLink: 'Public',
});
